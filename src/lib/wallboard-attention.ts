import { differenceInHours, subDays } from "date-fns";
import type {
	AttentionSeverity,
	CustomerAttentionSignal,
	CustomerAttentionSummary,
	SupportCaseRecord,
} from "./support-health/types";

const MAX_CUSTOMER_SIGNALS = 5;
const MAX_PRODUCT_SIGNALS = 4;
const GENERIC_TAGS = new Set([
	"conversation",
	"customer replied",
	"support",
	"inbox",
	"open",
	"closed",
	"resolved",
	"priority",
	"ticket",
	"tickets",
	"nps",
	"csat",
]);

const BLOCKED_PATTERNS = [
	/\bblock(?:ed|ing)?\b/i,
	/\bcan(?:not|'t)\b/i,
	/\bnot working\b/i,
	/\bdoes(?:n't| not) work\b/i,
	/\bbroken\b/i,
	/\bbloker(?:et|er)\b/i,
	/\bvirker ikke\b/i,
];
const CONFIDENCE_PATTERNS = [
	/\bfrustrat(?:ed|ing)\b/i,
	/\bdisappoint(?:ed|ing)\b/i,
	/\bunacceptable\b/i,
	/\bcancel(?:ling|ation)?\b/i,
	/\bchurn\b/i,
	/\bagain\b/i,
	/\bstill waiting\b/i,
	/\bfrustrer(?:et|ende)\b/i,
	/\bskuff(?:et|ende)\b/i,
	/\bopsig(?:e|else)\b/i,
	/\bstadig\b/i,
	/\bigen\b/i,
];
const GENERIC_CHAT_CHOICES = new Set([
	"ask a question",
	"stil et spørgsmål",
	"share feedback",
	"del feedback",
	"send us a message",
	"start a conversation",
	"conversation",
	"new conversation",
]);

function plainText(value: string | null | undefined) {
	return (value ?? "")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&#39;/gi, "'")
		.replace(/&quot;/gi, '"')
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
		.replace(/https?:\/\/\S+/gi, "[link]")
		.replace(/\s+/g, " ")
		.trim();
}

function clamp(value: string, length: number) {
	if (value.length <= length) return value;
	return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

function isGenericChatChoice(value: string) {
	const normalized = value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
	return GENERIC_CHAT_CHOICES.has(normalized);
}

function conversationText(item: SupportCaseRecord) {
	return `${plainText(item.title)} ${plainText(item.description)}`.trim();
}

function includesPattern(text: string, patterns: RegExp[]) {
	return patterns.some((pattern) => pattern.test(text));
}

interface RankedCase {
	item: SupportCaseRecord;
	score: number;
	reasons: string[];
	isBlocked: boolean;
	hasConfidenceRisk: boolean;
}

function isSupportActionable(item: SupportCaseRecord) {
	if (
		item.nextActionOwner &&
		item.nextActionOwner !== "support" &&
		item.nextActionOwner !== "none"
	) {
		return false;
	}
	if (item.actionableState === "resolved") return false;
	if (item.actionableState === "awaiting-customer") return false;
	if (item.isAssignedToDeveloperTeam && !item.isTicketReview) return false;
	if (
		item.subtype === "ticket" &&
		!item.isTicketReview &&
		!item.isBreached &&
		!item.isDueSoon &&
		item.actionableState !== "unassigned"
	) {
		return false;
	}
	return true;
}

function buildWaitingElsewhere(cases: SupportCaseRecord[]) {
	const waiting = cases.filter(
		(item) => item.actionableState !== "resolved" && !isSupportActionable(item),
	);
	let customerCount = 0;
	let developmentCount = 0;
	let otherCount = 0;
	for (const item of waiting) {
		if (
			item.nextActionOwner === "customer" ||
			item.actionableState === "awaiting-customer"
		) {
			customerCount++;
		} else if (
			item.nextActionOwner === "development" ||
			item.isAssignedToDeveloperTeam
		) {
			developmentCount++;
		} else {
			otherCount++;
		}
	}
	return {
		totalCount: waiting.length,
		customerCount,
		developmentCount,
		otherCount,
	};
}

function rankCustomerCase(item: SupportCaseRecord, now: Date): RankedCase {
	const reasons: string[] = [];
	const text = conversationText(item);
	const isBlocked = includesPattern(text, BLOCKED_PATTERNS);
	const hasConfidenceRisk = includesPattern(text, CONFIDENCE_PATTERNS);
	let score = 0;

	if (item.isBreached) {
		score += 42;
		reasons.push("past SLA");
	} else if (item.isDueSoon) {
		score += 24;
		reasons.push("due within 60 minutes");
	}
	if (item.isHighRisk) score += 18;
	if (item.priority === "urgent") {
		score += 22;
		reasons.push("urgent priority");
	} else if (item.priority === "high") {
		score += 12;
		reasons.push("high priority");
	}
	if (item.customerTier === "enterprise") {
		score += 12;
		reasons.push("enterprise customer");
	}
	if (item.reopenCount > 0) {
		score += Math.min(20, 10 + item.reopenCount * 3);
		reasons.push(
			item.reopenCount === 1
				? "reopened once"
				: `reopened ${item.reopenCount} times`,
		);
	}
	if (isBlocked) {
		score += 20;
		reasons.push("customer may be blocked");
	}
	if (hasConfidenceRisk) {
		score += 18;
		reasons.push("language suggests declining confidence");
	}
	if (!item.hasAssignment) {
		score += 10;
		reasons.push("no clear owner");
	}
	if (item.actionableState === "awaiting-team") score += 6;
	const waitingHours = Math.max(
		0,
		differenceInHours(now, item.waitingSinceAt ?? item.updatedAt),
	);
	if (waitingHours >= 24) {
		score += Math.min(16, Math.floor(waitingHours / 12));
		reasons.push(`waiting ${waitingHours} hours`);
	}

	return { item, score, reasons, isBlocked, hasConfidenceRisk };
}

function severityForScore(score: number): AttentionSeverity {
	if (score >= 55) return "critical";
	if (score >= 30) return "important";
	return "watch";
}

function customerHeadline(ranked: RankedCase) {
	const customer = ranked.item.contactName?.trim() || "A customer";
	if (ranked.hasConfidenceRisk) return `${customer} may be losing confidence`;
	if (ranked.isBlocked) return `${customer} appears blocked`;
	if (ranked.item.isBreached) return `${customer} has waited beyond SLA`;
	if (ranked.item.isDueSoon)
		return `${customer} needs an update within the hour`;
	if (!ranked.item.hasAssignment) return `${customer} is waiting for Support`;
	return `${customer} needs a clear next step`;
}

function customerAction(ranked: RankedCase) {
	if (!ranked.item.hasAssignment)
		return "Assign an owner, then give the customer a concrete next update time.";
	if (ranked.hasConfidenceRisk || ranked.isBlocked)
		return "Confirm the impact, give a concrete status, and commit to the next update time.";
	if (ranked.item.isBreached)
		return "Send a useful holding update now, then confirm the path to resolution.";
	if (ranked.item.isDueSoon)
		return "Reply before the SLA deadline or set a clear expectation if the answer needs more time.";
	return "Review the latest request and make the next owner and customer update explicit.";
}

function buildCustomerSignal(ranked: RankedCase): CustomerAttentionSignal {
	const item = ranked.item;
	const description = plainText(item.description);
	const title = plainText(item.title);
	const evidence =
		(description && !isGenericChatChoice(description) ? description : "") ||
		(title && !isGenericChatChoice(title) ? title : "") ||
		"No additional customer message is available.";
	return {
		id: `customer-${item.id}`,
		kind: "customer",
		severity: severityForScore(ranked.score),
		owner: "support",
		headline: customerHeadline(ranked),
		summary: clamp(evidence, 190),
		suggestedAction: customerAction(ranked),
		reasons: ranked.reasons.slice(0, 3),
		productNames: [item.productName || "Unmapped"],
		conversationExternalIds: [item.externalId],
		affectedCustomerCount: 1,
		contactName: item.contactName?.trim() || null,
		assigneeName: item.assigneeName?.trim() || null,
		assigneeAvatarUrl: item.assigneeAvatarUrl,
		updatedAt: item.updatedAt.toISOString(),
	};
}

function normalizeThemeTag(tag: string) {
	return plainText(tag).replace(/[_-]+/g, " ").toLowerCase();
}

function titleCase(value: string) {
	return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildProductSignals(cases: SupportCaseRecord[], now: Date) {
	const recentCutoff = subDays(now, 14);
	const groups = new Map<string, SupportCaseRecord[]>();
	for (const item of cases) {
		if (item.updatedAt < recentCutoff) continue;
		for (const rawTag of item.tags) {
			const tag = normalizeThemeTag(rawTag);
			if (!tag || tag.length < 3 || GENERIC_TAGS.has(tag)) continue;
			if (tag === item.productName.toLowerCase()) continue;
			const group = groups.get(tag) ?? [];
			if (!group.some((candidate) => candidate.id === item.id))
				group.push(item);
			groups.set(tag, group);
		}
	}

	return [...groups.entries()]
		.filter(([, items]) => items.length >= 2)
		.map(([tag, items]) => {
			const customers = new Set(
				items.map((item) => item.contactName).filter(Boolean),
			);
			const products = [
				...new Set(items.map((item) => item.productName).filter(Boolean)),
			];
			const openCount = items.filter(
				(item) => item.actionableState !== "resolved",
			).length;
			const criticalCount = items.filter(
				(item) => item.isBreached || item.isHighRisk,
			).length;
			const latest = [...items].sort(
				(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
			)[0];
			const severity: AttentionSeverity =
				criticalCount > 0 || items.length >= 5
					? "critical"
					: items.length >= 3
						? "important"
						: "watch";
			return {
				score: items.length * 10 + openCount * 5 + criticalCount * 12,
				signal: {
					id: `product-${tag.replace(/\s+/g, "-")}`,
					kind: "product" as const,
					severity,
					owner: "shared" as const,
					headline: `${titleCase(tag)} is a recurring customer theme`,
					summary: `${items.length} conversations from ${Math.max(customers.size, 1)} customer${customers.size === 1 ? "" : "s"} mention this${products.length > 1 ? ` across ${products.length} products` : ""}. ${openCount} still need attention.`,
					suggestedAction:
						"Support should connect the evidence; development or product should confirm whether there is one shared cause.",
					reasons: [
						`${items.length} related conversations`,
						`${openCount} currently open`,
						...(products.length > 1
							? [`spans ${products.length} products`]
							: []),
					].slice(0, 3),
					productNames: products,
					conversationExternalIds: items
						.slice(0, 6)
						.map((item) => item.externalId),
					affectedCustomerCount: Math.max(customers.size, 1),
					contactName: null,
					assigneeName: null,
					assigneeAvatarUrl: null,
					updatedAt: latest.updatedAt.toISOString(),
				} satisfies CustomerAttentionSignal,
			};
		})
		.sort((left, right) => right.score - left.score)
		.slice(0, MAX_PRODUCT_SIGNALS)
		.map((entry) => entry.signal);
}

export function buildCustomerAttentionSummary(
	cases: SupportCaseRecord[],
	now = new Date(),
): CustomerAttentionSummary {
	const actionable = cases.filter(isSupportActionable);
	const ranked = actionable
		.map((item) => rankCustomerCase(item, now))
		.sort((left, right) => right.score - left.score);
	const customerSignals = ranked
		.slice(0, MAX_CUSTOMER_SIGNALS)
		.map(buildCustomerSignal);
	const productSignals = buildProductSignals(cases, now);
	const criticalCount = customerSignals.filter(
		(signal) => signal.severity === "critical",
	).length;
	const status =
		criticalCount > 0
			? "needs-attention"
			: customerSignals.length > 0 || productSignals.length > 0
				? "watch"
				: "calm";
	const statusLabel =
		status === "needs-attention"
			? "Needs attention"
			: status === "watch"
				? customerSignals.length > 0
					? "Support can act"
					: "Worth watching"
				: "Calm";
	const summary =
		status === "needs-attention"
			? `${criticalCount} customer situation${criticalCount === 1 ? "" : "s"} need a clear owner or update now.`
			: status === "watch"
				? customerSignals.length > 0
					? `${actionable.length} customer situation${actionable.length === 1 ? "" : "s"} can be moved forward by Support now.`
					: "No immediate support action, but recurring customer themes are worth watching."
				: "No material customer-risk signals are visible in the current Intercom data.";

	return {
		status,
		statusLabel,
		summary,
		atRiskCustomerCount: customerSignals.length,
		supportActionCount: actionable.length,
		recurringThemeCount: productSignals.length,
		customerSignals,
		productSignals,
		waitingElsewhere: buildWaitingElsewhere(cases),
	};
}
