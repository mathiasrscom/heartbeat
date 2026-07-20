import {
	differenceInCalendarDays,
	differenceInMinutes,
	eachDayOfInterval,
	endOfDay,
	format,
	isBefore,
	isWithinInterval,
	startOfDay,
	startOfMonth,
	startOfQuarter,
	startOfYear,
	subDays,
	subMonths,
	subQuarters,
	subYears,
} from "date-fns";
import { averageNpsRating, calculateNps } from "@/lib/nps";
import type { ResolvedSupportPeriod } from "./period";
import {
	DEFAULT_SUPPORT_TARGETS,
	type SupportPerformanceTargets,
} from "./targets";
import type {
	ActionableState,
	ActionItem,
	CaseLookupItem,
	CaseStatusBreakdown,
	ClassificationHint,
	CxPeriodSummary,
	DailyVolumeSlaPoint,
	LiveWallboardData,
	NpsPeriodSummary,
	NpsRecord,
	NpsTheme,
	ProductHealthRow,
	ProductHealthSummary,
	QueueHealth,
	SupportCasePriority,
	SupportCaseRecord,
	SupportHealthSnapshot,
	SupportServiceBucket,
	SupportTier,
	SupportWorkflowCounts,
	TopContributorsSummary,
	TrendPoint,
	TrendsWallboardData,
} from "./types";

interface ActionableStateInput {
	status: string;
	hasAssignment: boolean;
	rawSlaStatus: string | null;
	hasSlaTracking: boolean;
	nextDueAt: Date | null;
	waitingSinceAt: Date | null;
	priority: SupportCasePriority;
	customerTier: SupportTier;
	isAwaitingCustomer: boolean;
	now: Date;
}

type LiveWallboardPayload = Omit<
	LiveWallboardData,
	| "workflowCounts"
	| "productMetrics"
	| "defaultTargets"
	| "selectedTargets"
	| "productTargets"
	| "intercomAppUrl"
	| "availableProducts"
	| "selectedProducts"
	| "trackedTeammates"
	| "focusPlan"
	| "wallboardTheme"
	| "insights"
	| "attention"
>;

type TrendsWallboardPayload = Omit<
	TrendsWallboardData,
	| "workflowCounts"
	| "defaultTargets"
	| "selectedTargets"
	| "productTargets"
	| "intercomAppUrl"
	| "availableProducts"
	| "selectedProducts"
	| "wallboardTheme"
	| "insights"
	| "npsSummary"
	| "npsSeries"
	| "npsDistribution"
	| "npsComments"
	| "npsThemes"
	| "npsByProduct"
	| "topContributors"
	| "topContributorsByProduct"
	| "tickerItems"
	| "attention"
>;

const GENERIC_QUEUE_NAMES = new Set([
	"general",
	"support",
	"customer support",
	"shared inbox",
	"inbox",
	"team inbox",
	"ticket",
	"tickets",
	"conversation",
	"conversations",
]);

function round(value: number, digits = 1) {
	return Number(value.toFixed(digits));
}

function formatAgeLabel(minutes: number) {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	if (hours < 24) {
		return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
	}

	const days = Math.floor(hours / 24);
	const hourRemainder = hours % 24;
	return hourRemainder === 0 ? `${days}d` : `${days}d ${hourRemainder}h`;
}

function getOverdueMinutes(item: SupportCaseRecord, now: Date) {
	if (!item.isBreached || !item.nextDueAt) return 0;
	return Math.max(0, differenceInMinutes(now, item.nextDueAt));
}

function getMinutesUntilDue(item: SupportCaseRecord, now: Date) {
	if (!item.isDueSoon || !item.nextDueAt) return Number.POSITIVE_INFINITY;
	return Math.max(0, differenceInMinutes(item.nextDueAt, now));
}

function normalizeLabel(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function isResolvedStatus(status: string) {
	return ["resolved", "closed"].includes(status);
}

function isGenericQueueName(value: string) {
	return GENERIC_QUEUE_NAMES.has(normalizeLabel(value));
}

export function resolveResponseTargetMinutes(
	priority: SupportCasePriority,
	customerTier: SupportTier,
) {
	if (priority === "urgent") return 15;
	if (priority === "high") return 60;
	if (customerTier === "enterprise") return 60;
	if (customerTier === "pro") return 180;
	return 240;
}

export function isCaseBreached(input: ActionableStateInput) {
	if (isResolvedStatus(input.status)) return false;
	if (input.isAwaitingCustomer) return false;
	if (input.rawSlaStatus?.toLowerCase() === "missed") return true;
	if (!input.hasSlaTracking) return false;
	if (!input.nextDueAt) return false;
	return isBefore(input.nextDueAt, input.now);
}

export function isCaseDueSoon(input: ActionableStateInput) {
	if (isResolvedStatus(input.status)) return false;
	if (input.isAwaitingCustomer) return false;
	if (isCaseBreached(input)) return false;
	if (!input.hasSlaTracking) return false;
	if (input.nextDueAt) {
		return differenceInMinutes(input.nextDueAt, input.now) <= 60;
	}
	return false;
}

export function classifyActionableState(
	input: ActionableStateInput,
): ActionableState {
	if (isResolvedStatus(input.status)) return "resolved";
	if (isCaseBreached(input)) return "breached";
	if (isCaseDueSoon(input)) return "due-soon";
	if (!input.hasAssignment) return "unassigned";
	if (input.isAwaitingCustomer) return "awaiting-customer";
	return "awaiting-team";
}

function isActionableCase(item: SupportCaseRecord) {
	return item.actionableState !== "resolved";
}

export function buildWorkflowCounts(
	cases: SupportCaseRecord[],
): SupportWorkflowCounts {
	const openCases = cases.filter(isActionableCase);

	return {
		ticketReviewCount: openCases.filter((item) => item.isTicketReview).length,
		developerTeamAssignedCount: openCases.filter(
			(item) => item.isAssignedToDeveloperTeam,
		).length,
	};
}

function filterCasesByBucket(
	cases: SupportCaseRecord[],
	bucket: SupportServiceBucket,
) {
	return cases.filter((item) => item.serviceBucket === bucket);
}

function getOldestActionableAgeMinutes(cases: SupportCaseRecord[], now: Date) {
	const actionable = cases.filter(isActionableCase);
	if (actionable.length === 0) return null;

	return Math.max(
		...actionable.map((item) =>
			differenceInMinutes(now, item.waitingSinceAt ?? item.createdAt),
		),
	);
}

function buildStatusLabel(status: SupportHealthSnapshot["status"]) {
	if (status === "green") return "On track";
	if (status === "yellow") return "Needs attention";
	return "Off track";
}

export function calculateHealthStatus(input: {
	breachedCount: number;
	dueSoonCount: number;
	urgentHighRiskCount: number;
	unassignedCount: number;
	unknownCaseCount: number;
	unknownBreachedCount: number;
	stale: boolean;
	queueOffTrack: boolean;
}): SupportHealthSnapshot["status"] {
	if (
		input.urgentHighRiskCount > 0 ||
		input.breachedCount >= 3 ||
		input.queueOffTrack
	) {
		return "red";
	}

	if (
		input.stale ||
		input.breachedCount > 0 ||
		input.dueSoonCount >= 3 ||
		input.unassignedCount >= 3 ||
		input.unknownBreachedCount > 0 ||
		input.unknownCaseCount >= 3
	) {
		return "yellow";
	}

	return "green";
}

export function buildSupportHealthSnapshot(
	cases: SupportCaseRecord[],
	lastSyncAt: Date | null,
	now: Date,
): SupportHealthSnapshot {
	const headlineCases = filterCasesByBucket(cases, "headline");
	const exceptionCases = filterCasesByBucket(cases, "exception");
	const unknownCases = filterCasesByBucket(cases, "unknown");

	const activeCases = headlineCases.filter(isActionableCase);
	const currentActiveCases = cases.filter(isActionableCase);
	const exceptionActiveCases = exceptionCases.filter(isActionableCase);
	const unknownActiveCases = unknownCases.filter(isActionableCase);

	const dueSoonCount = activeCases.filter((item) => item.isDueSoon).length;
	const currentDueSoonCount = currentActiveCases.filter(
		(item) => item.isDueSoon,
	).length;
	const breachedCount = activeCases.filter((item) => item.isBreached).length;
	const currentBreachedCount = currentActiveCases.filter(
		(item) => item.isBreached,
	).length;
	const unassignedCount = activeCases.filter(
		(item) => !item.hasAssignment,
	).length;
	const currentUnassignedCount = currentActiveCases.filter(
		(item) => !item.hasAssignment,
	).length;
	const urgentHighRiskCount = activeCases.filter(
		(item) => item.isHighRisk,
	).length;
	const currentUrgentHighRiskCount = currentActiveCases.filter(
		(item) => item.isHighRisk,
	).length;
	const awaitingTeamCount = activeCases.filter(
		(item) =>
			item.actionableState === "awaiting-team" ||
			item.actionableState === "due-soon" ||
			item.actionableState === "breached",
	).length;
	const currentAwaitingTeamCount = currentActiveCases.filter(
		(item) =>
			item.actionableState === "awaiting-team" ||
			item.actionableState === "due-soon" ||
			item.actionableState === "breached",
	).length;
	const awaitingCustomerCount = activeCases.filter(
		(item) => item.actionableState === "awaiting-customer",
	).length;
	const currentAwaitingCustomerCount = currentActiveCases.filter(
		(item) => item.actionableState === "awaiting-customer",
	).length;

	const slaTrackedCases = currentActiveCases.filter(
		(item) => item.rawSlaStatus !== null || item.nextDueAt !== null,
	);
	const slaAdherencePercent =
		slaTrackedCases.length === 0
			? 100
			: round(
					((slaTrackedCases.length -
						slaTrackedCases.filter((item) => item.isBreached).length) /
						slaTrackedCases.length) *
						100,
				);

	const freshnessMinutes =
		lastSyncAt === null
			? Number.POSITIVE_INFINITY
			: differenceInMinutes(now, lastSyncAt);
	const stale = freshnessMinutes > 10;

	const queues = buildQueueHealth(cases, now, "headline");
	const queueOffTrack = queues.some(
		(queue) => queue.breachedCount >= 2 || queue.dueSoonCount >= 6,
	);

	const status = calculateHealthStatus({
		breachedCount,
		dueSoonCount,
		urgentHighRiskCount,
		unassignedCount,
		unknownCaseCount: unknownActiveCases.length,
		unknownBreachedCount: unknownActiveCases.filter((item) => item.isBreached)
			.length,
		stale,
		queueOffTrack,
	});

	return {
		status,
		statusLabel: buildStatusLabel(status),
		activeCaseCount: activeCases.length,
		currentActiveCaseCount: currentActiveCases.length,
		slaAdherencePercent,
		dueSoonCount,
		currentDueSoonCount,
		breachedCount,
		currentBreachedCount,
		unassignedCount,
		currentUnassignedCount,
		urgentHighRiskCount,
		currentUrgentHighRiskCount,
		awaitingTeamCount,
		currentAwaitingTeamCount,
		awaitingCustomerCount,
		currentAwaitingCustomerCount,
		exceptionCaseCount: exceptionActiveCases.length,
		exceptionBreachedCount: exceptionActiveCases.filter(
			(item) => item.isBreached,
		).length,
		unknownCaseCount: unknownActiveCases.length,
		unknownBreachedCount: unknownActiveCases.filter((item) => item.isBreached)
			.length,
		oldestActionableAgeMinutes: getOldestActionableAgeMinutes(
			headlineCases,
			now,
		),
		oldestExceptionAgeMinutes: getOldestActionableAgeMinutes(
			exceptionCases,
			now,
		),
		freshnessTimestamp: lastSyncAt?.toISOString() ?? null,
		stale,
	};
}

export function buildQueueHealth(
	cases: SupportCaseRecord[],
	now: Date,
	bucket?: SupportServiceBucket,
) {
	const grouped = new Map<string, SupportCaseRecord[]>();

	const filteredCases = cases
		.filter(isActionableCase)
		.filter((item) => (bucket ? item.serviceBucket === bucket : true));

	for (const item of filteredCases) {
		const key = item.productName || "Unmapped";
		const list = grouped.get(key);
		if (list) {
			list.push(item);
		} else {
			grouped.set(key, [item]);
		}
	}

	const queues: QueueHealth[] = Array.from(grouped.entries()).map(
		([teamName, items]) => ({
			teamName,
			sourceQueues: Array.from(
				new Set(
					items
						.map((item) => item.teamName)
						.filter((value) => value && value !== teamName),
				),
			).sort(),
			serviceBucket: items[0]?.serviceBucket ?? "headline",
			servicePolicyName: items[0]?.servicePolicyName ?? "Standard workflow",
			activeCaseCount: items.length,
			awaitingTeamCount: items.filter(
				(item) =>
					item.actionableState === "awaiting-team" ||
					item.actionableState === "due-soon" ||
					item.actionableState === "breached",
			).length,
			dueSoonCount: items.filter((item) => item.isDueSoon).length,
			breachedCount: items.filter((item) => item.isBreached).length,
			unassignedCount: items.filter((item) => !item.hasAssignment).length,
			urgentCount: items.filter((item) => item.priority === "urgent").length,
			enterpriseCount: items.filter(
				(item) => item.customerTier === "enterprise",
			).length,
			oldestActionableAgeMinutes: items.length
				? Math.max(
						...items.map((item) =>
							differenceInMinutes(now, item.waitingSinceAt ?? item.createdAt),
						),
					)
				: null,
			priorityMix: {
				low: items.filter((item) => item.priority === "low").length,
				normal: items.filter((item) => item.priority === "normal").length,
				high: items.filter((item) => item.priority === "high").length,
				urgent: items.filter((item) => item.priority === "urgent").length,
			},
		}),
	);

	return sortQueuesByRisk(queues);
}

export function buildActionItems(queues: QueueHealth[]): ActionItem[] {
	return sortQueuesByRisk(
		queues.filter(
			(queue) =>
				queue.breachedCount > 0 ||
				queue.dueSoonCount > 0 ||
				queue.unassignedCount > 0,
		),
	)
		.slice(0, 3)
		.map((queue, index) => {
			const severity =
				queue.breachedCount > 0 || queue.urgentCount > 0 ? "red" : "yellow";

			let label = `Reply to ${queue.teamName}`;
			let detail = `${queue.awaitingTeamCount} customers are waiting on the team`;

			if (queue.breachedCount > 0) {
				detail = `${queue.breachedCount} are over SLA now`;
			} else if (queue.dueSoonCount > 0) {
				label = `Watch ${queue.teamName}`;
				detail = `${queue.dueSoonCount} are due within the next 60 minutes`;
			} else if (queue.unassignedCount > 0) {
				label = `Assign ${queue.teamName}`;
				detail = `${queue.unassignedCount} are still unassigned`;
			}

			if (queue.breachedCount > 0 && queue.dueSoonCount > 0) {
				detail = `${detail} • ${queue.dueSoonCount} more are due soon`;
			} else if (queue.unassignedCount > 0 && queue.breachedCount === 0) {
				detail = `${detail} • ${queue.awaitingTeamCount} total are waiting on the team`;
			}

			return {
				id: `${queue.teamName}-${index}`,
				severity,
				label,
				detail,
				queueName: queue.teamName,
			};
		});
}

export function buildCoverageActionItems(queues: QueueHealth[]) {
	return buildActionItems(queues);
}

export function buildUnknownSignals(
	cases: SupportCaseRecord[],
): ClassificationHint[] {
	const unknownCases = filterCasesByBucket(cases, "unknown").filter(
		isActionableCase,
	);
	const counts = new Map<string, ClassificationHint>();

	const add = (kind: ClassificationHint["kind"], label: string) => {
		const normalized = normalizeLabel(label);
		if (!normalized) return;
		const key = `${kind}:${normalized}`;
		const current = counts.get(key);
		if (current) {
			current.count += 1;
			return;
		}
		counts.set(key, {
			label,
			count: 1,
			kind,
		});
	};

	for (const item of unknownCases) {
		if (item.teamName && !isGenericQueueName(item.teamName)) {
			add("queue", item.teamName);
		}

		for (const tag of item.tags) {
			if (tag.trim()) {
				add("tag", tag);
			}
		}
	}

	if (counts.size === 0) {
		for (const item of unknownCases) {
			if (item.teamName) {
				add("queue", item.teamName);
			}
		}
	}

	return Array.from(counts.values())
		.sort((left, right) => {
			if (right.count !== left.count) return right.count - left.count;
			if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
			return left.label.localeCompare(right.label);
		})
		.slice(0, 6);
}

function getPeriodEligibleCases(
	cases: SupportCaseRecord[],
	start: Date,
	end: Date,
) {
	return cases.filter((item) => {
		const resolvedAt = item.resolvedAt ?? item.updatedAt;
		return (
			item.subtype === "conversation" &&
			isWithinInterval(resolvedAt, { start, end }) &&
			item.actionableState === "resolved"
		);
	});
}

function toFivePointRating(score: number): 1 | 2 | 3 | 4 | 5 {
	const normalized = Math.round(score / 2);
	if (normalized <= 1) return 1;
	if (normalized >= 5) return 5;
	return normalized as 1 | 2 | 3 | 4 | 5;
}

function toSatisfactionPercent(positiveCount: number, ratedCount: number) {
	if (ratedCount === 0) return null;
	return round((positiveCount / ratedCount) * 100);
}

function buildCxAggregate(eligible: SupportCaseRecord[]) {
	const rated = eligible.filter((item) => item.cxScore !== null);
	const ratingMix: Record<1 | 2 | 3 | 4 | 5, number> = {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0,
	};

	for (const item of rated) {
		const bucket = toFivePointRating(item.cxScore ?? 0);
		ratingMix[bucket] += 1;
	}

	const positiveCount = ratingMix[4] + ratingMix[5];

	return {
		score:
			rated.length === 0
				? null
				: round(
						rated.reduce((sum, item) => sum + (item.cxScore ?? 0), 0) /
							rated.length,
						2,
					),
		satisfactionScorePercent: toSatisfactionPercent(
			positiveCount,
			rated.length,
		),
		responseRatePercent:
			eligible.length === 0 ? 0 : round((rated.length / eligible.length) * 100),
		ratedCount: rated.length,
		eligibleCount: eligible.length,
		positiveCount,
		ratingMix,
	};
}

function isSlaMissedForPeriod(item: SupportCaseRecord, _now: Date) {
	if (isActionableCase(item)) {
		return item.isBreached;
	}

	if (item.rawSlaStatus?.toLowerCase() === "missed") return true;
	if (item.rawSlaStatus?.toLowerCase() === "hit") return false;
	if (!item.nextDueAt) return false;

	const resolvedReference = item.resolvedAt ?? item.updatedAt;
	return isBefore(item.nextDueAt, resolvedReference);
}

function scoreQueueRisk(queue: QueueHealth) {
	return (
		queue.breachedCount * 100 +
		queue.dueSoonCount * 20 +
		queue.unassignedCount * 15 +
		queue.urgentCount * 10 +
		(queue.oldestActionableAgeMinutes ?? 0)
	);
}

function sortQueuesByRisk(queues: QueueHealth[]) {
	return [...queues].sort(
		(left, right) => scoreQueueRisk(right) - scoreQueueRisk(left),
	);
}

function compareLookupCases(
	left: SupportCaseRecord,
	right: SupportCaseRecord,
	now: Date,
) {
	if (left.isBreached !== right.isBreached) {
		return left.isBreached ? -1 : 1;
	}

	if (left.isBreached && right.isBreached) {
		const overdueDiff =
			getOverdueMinutes(right, now) - getOverdueMinutes(left, now);
		if (overdueDiff !== 0) return overdueDiff;
	}

	if (left.isDueSoon !== right.isDueSoon) {
		return left.isDueSoon ? -1 : 1;
	}

	if (left.isDueSoon && right.isDueSoon) {
		const dueDiff =
			getMinutesUntilDue(left, now) - getMinutesUntilDue(right, now);
		if (dueDiff !== 0) return dueDiff;
	}

	if (
		left.actionableState === "unassigned" &&
		right.actionableState !== "unassigned"
	) {
		return -1;
	}
	if (
		right.actionableState === "unassigned" &&
		left.actionableState !== "unassigned"
	) {
		return 1;
	}

	if (left.isHighRisk !== right.isHighRisk) {
		return left.isHighRisk ? -1 : 1;
	}

	const ageDiff =
		differenceInMinutes(now, right.waitingSinceAt ?? right.createdAt) -
		differenceInMinutes(now, left.waitingSinceAt ?? left.createdAt);
	if (ageDiff !== 0) return ageDiff;

	return right.updatedAt.getTime() - left.updatedAt.getTime();
}

function toCaseStateLabel(item: SupportCaseRecord) {
	if (item.isBreached) return "Over SLA";
	if (item.isDueSoon) return "Due in 60m";
	if (item.actionableState === "unassigned") return "Unassigned";
	if (item.actionableState === "awaiting-customer")
		return "Waiting on customer";
	return "Waiting on us";
}

function toCaseTimingLabel(item: SupportCaseRecord, now: Date) {
	if (item.isBreached) {
		const overdueMinutes = getOverdueMinutes(item, now);
		if (overdueMinutes <= 0) return "Due now";
		return `${formatAgeLabel(overdueMinutes)} overdue`;
	}

	if (item.isDueSoon && item.nextDueAt) {
		const minutesUntilDue = getMinutesUntilDue(item, now);
		if (minutesUntilDue <= 0) return "Due now";
		return `Due in ${formatAgeLabel(minutesUntilDue)}`;
	}

	return `Waiting ${formatAgeLabel(
		differenceInMinutes(now, item.waitingSinceAt ?? item.createdAt),
	)}`;
}

function isWithinOptionalPeriod(
	value: Date,
	periodStart?: Date,
	periodEnd?: Date,
) {
	if (!periodStart || !periodEnd) return true;
	return isWithinInterval(value, { start: periodStart, end: periodEnd });
}

function formatMomentProductName(productName: string) {
	return productName === "Unmapped" ? "the support queue" : productName;
}

function inferCaseTopic(item: SupportCaseRecord) {
	const source =
		`${item.title ?? ""} ${item.tags.join(" ")} ${item.teamName} ${item.productName}`.toLowerCase();

	if (/(integrat|api|webhook|sdk|oauth|sso)/.test(source))
		return "integrations";
	if (/(bill|invoice|payment|refund|subscription|pricing)/.test(source))
		return "billing";
	if (/(login|password|access|permission|invite|account)/.test(source))
		return "account access";
	if (/(setup|config|configuration|onboard|install)/.test(source))
		return "setup";
	if (/(bug|error|incident|outage|failure|crash)/.test(source))
		return "issue recovery";
	if (/(sign|signature|nemid|mitid|certificate)/.test(source)) return "signing";
	return null;
}

function buildPeopleMoments(
	cases: SupportCaseRecord[],
	now: Date,
	options?: {
		periodStart?: Date;
		periodEnd?: Date;
	},
) {
	const messages: string[] = [];
	const seen = new Set<string>();
	const periodStart = options?.periodStart;
	const periodEnd = options?.periodEnd;
	const asCount = (value: number, noun: string) =>
		`${value} ${noun}${value === 1 ? "" : "s"}`;

	const push = (value: string) => {
		const normalized = value.trim();
		if (!normalized) return;
		const key = normalized.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		messages.push(normalized);
	};

	const actionable = [...cases]
		.filter(isActionableCase)
		.sort((left, right) => compareLookupCases(left, right, now));
	const pressureByProduct = new Map<
		string,
		{
			productLabel: string;
			breachedCount: number;
			dueSoonCount: number;
			unassignedCount: number;
			breachedOwner: string | null;
			dueSoonOwner: string | null;
		}
	>();

	for (const item of actionable) {
		if (!item.isBreached && !item.isDueSoon && item.hasAssignment) continue;

		const productLabel = formatMomentProductName(item.productName);
		const current = pressureByProduct.get(productLabel) ?? {
			productLabel,
			breachedCount: 0,
			dueSoonCount: 0,
			unassignedCount: 0,
			breachedOwner: null,
			dueSoonOwner: null,
		};

		if (item.isBreached) {
			current.breachedCount += 1;
			if (!current.breachedOwner && item.assigneeName?.trim()) {
				current.breachedOwner = item.assigneeName.trim();
			}
		} else if (item.isDueSoon) {
			current.dueSoonCount += 1;
			if (!current.dueSoonOwner && item.assigneeName?.trim()) {
				current.dueSoonOwner = item.assigneeName.trim();
			}
		}

		if (!item.hasAssignment) {
			current.unassignedCount += 1;
		}

		pressureByProduct.set(productLabel, current);
	}

	for (const product of [...pressureByProduct.values()]
		.sort((left, right) => {
			const leftScore =
				left.breachedCount * 100 +
				left.dueSoonCount * 30 +
				left.unassignedCount * 20;
			const rightScore =
				right.breachedCount * 100 +
				right.dueSoonCount * 30 +
				right.unassignedCount * 20;
			return rightScore - leftScore;
		})
		.slice(0, 3)) {
		if (product.breachedCount > 0) {
			const ownerSuffix = product.breachedOwner
				? ` ${product.breachedOwner} owns one right now.`
				: "";
			if (product.unassignedCount > 0) {
				push(
					`${product.productLabel}: ${asCount(product.breachedCount, "over-SLA case")} need attention; ${asCount(product.unassignedCount, "case")} are still unassigned.${ownerSuffix}`,
				);
				continue;
			}

			push(
				`${product.productLabel}: ${asCount(product.breachedCount, "over-SLA case")} need attention.${ownerSuffix}`,
			);
			continue;
		}

		if (product.dueSoonCount > 0) {
			const ownerSuffix = product.dueSoonOwner
				? ` ${product.dueSoonOwner} owns one of them.`
				: "";
			if (product.unassignedCount > 0) {
				push(
					`${product.productLabel}: ${asCount(product.dueSoonCount, "case")} are due within 60 minutes; ${asCount(product.unassignedCount, "case")} are still unassigned.${ownerSuffix}`,
				);
				continue;
			}

			push(
				`${product.productLabel}: ${asCount(product.dueSoonCount, "case")} are due within 60 minutes.${ownerSuffix}`,
			);
			continue;
		}

		push(
			`${product.productLabel}: ${asCount(product.unassignedCount, "case")} are unassigned. Assign owners now.`,
		);
	}

	const recentRated = [...cases]
		.filter((item) => {
			if (item.subtype !== "conversation") return false;
			if (item.actionableState !== "resolved") return false;
			if (item.cxScore === null) return false;
			if (!item.assigneeName || item.assigneeName.trim().length === 0)
				return false;
			const reference = item.resolvedAt ?? item.updatedAt;
			return isWithinOptionalPeriod(reference, periodStart, periodEnd);
		})
		.sort((left, right) => {
			const leftReference = left.resolvedAt ?? left.updatedAt;
			const rightReference = right.resolvedAt ?? right.updatedAt;
			return rightReference.getTime() - leftReference.getTime();
		});

	const recognitionByAssignee = new Map<
		string,
		{
			assignee: string;
			productLabel: string;
			bestRating: number;
			positiveCount: number;
			latestResolvedAt: Date;
			topic: string | null;
		}
	>();

	for (const item of recentRated) {
		const assignee = item.assigneeName?.trim();
		if (!assignee) continue;

		const rating = toFivePointRating(item.cxScore ?? 0);
		if (rating < 4) continue;

		const productLabel = formatMomentProductName(item.productName);
		const key = `${assignee.toLowerCase()}::${productLabel.toLowerCase()}`;
		const latestResolvedAt = item.resolvedAt ?? item.updatedAt;
		const topic = inferCaseTopic(item);
		const current = recognitionByAssignee.get(key);

		if (!current) {
			recognitionByAssignee.set(key, {
				assignee,
				productLabel,
				bestRating: rating,
				positiveCount: 1,
				latestResolvedAt,
				topic,
			});
			continue;
		}

		current.bestRating = Math.max(current.bestRating, rating);
		current.positiveCount += 1;
		if (latestResolvedAt > current.latestResolvedAt) {
			current.latestResolvedAt = latestResolvedAt;
		}
		if (!current.topic && topic) {
			current.topic = topic;
		}
	}

	for (const recognition of [...recognitionByAssignee.values()]
		.sort((left, right) => {
			if (right.bestRating !== left.bestRating) {
				return right.bestRating - left.bestRating;
			}
			if (right.positiveCount !== left.positiveCount) {
				return right.positiveCount - left.positiveCount;
			}
			return right.latestResolvedAt.getTime() - left.latestResolvedAt.getTime();
		})
		.slice(0, 4)) {
		const topicSuffix = recognition.topic ? ` on ${recognition.topic}` : "";

		if (recognition.positiveCount > 1) {
			push(
				`${recognition.assignee} recorded ${recognition.positiveCount} recent strong CX results in ${recognition.productLabel}${topicSuffix}.`,
			);
			continue;
		}

		push(
			`${recognition.assignee} delivered ${recognition.bestRating}/5 CX in ${recognition.productLabel}${topicSuffix}.`,
		);
	}

	return messages.slice(0, 8);
}

export function buildLookupCases(
	cases: SupportCaseRecord[],
	now: Date,
	limit = 5,
): CaseLookupItem[] {
	return [...cases]
		.filter((item) => isActionableCase(item) && item.isDueSoon)
		.sort((left, right) => compareLookupCases(left, right, now))
		.slice(0, limit)
		.map((item) => {
			return {
				id: item.id,
				externalId: item.externalId,
				productName: item.productName || "Unmapped",
				queueName: item.teamName,
				contactName: item.contactName?.trim() || null,
				assigneeName: item.assigneeName,
				assigneeAvatarUrl: item.assigneeAvatarUrl,
				subtype: item.subtype,
				stateLabel: toCaseStateLabel(item),
				ageLabel: toCaseTimingLabel(item, now),
				isBreached: item.isBreached,
				isDueSoon: item.isDueSoon,
				isHighRisk: item.isHighRisk,
			};
		});
}

export function buildDailyVolumeSlaSeries(
	cases: SupportCaseRecord[],
	now: Date,
	days = 30,
): DailyVolumeSlaPoint[] {
	const rangeEnd = endOfDay(now);
	const rangeStart = startOfDay(subDays(now, Math.max(days - 1, 0)));
	const labelFormat = days > 14 ? "d MMM" : "EEE d";

	return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((day) => {
		const dayEnd = endOfDay(day);
		const dayCases = cases.filter((item) =>
			isWithinInterval(item.createdAt, { start: day, end: dayEnd }),
		);
		const slaTracked = dayCases.filter((item) => item.hasSlaTracking);
		const slaMissedCount = slaTracked.filter((item) =>
			isSlaMissedForPeriod(item, now),
		).length;

		return {
			label: format(day, labelFormat),
			dateLabel: format(day, "EEE d MMM"),
			volume: dayCases.length,
			slaTrackedCount: slaTracked.length,
			slaMissedCount,
			slaAdherencePercent:
				slaTracked.length === 0
					? null
					: round(
							((slaTracked.length - slaMissedCount) / slaTracked.length) * 100,
						),
		};
	});
}

export function buildCxPeriodSummary(
	cases: SupportCaseRecord[],
	label: string,
	start: Date,
	end: Date,
	previousStart: Date,
	previousEnd: Date,
): CxPeriodSummary {
	const eligible = getPeriodEligibleCases(cases, start, end);
	const current = buildCxAggregate(eligible);
	const previous = buildCxAggregate(
		getPeriodEligibleCases(cases, previousStart, previousEnd),
	);

	return {
		label,
		score: current.score,
		satisfactionScorePercent: current.satisfactionScorePercent,
		responseRatePercent: current.responseRatePercent,
		ratedCount: current.ratedCount,
		eligibleCount: current.eligibleCount,
		positiveCount: current.positiveCount,
		ratingMix: current.ratingMix,
		deltaFromPrevious:
			current.score === null || previous.score === null
				? null
				: round(current.score - previous.score, 2),
	};
}

export function buildProductHealthRows(
	cases: SupportCaseRecord[],
	period: ResolvedSupportPeriod,
	now: Date,
	resolveTargets: (productName: string) => SupportPerformanceTargets = () =>
		DEFAULT_SUPPORT_TARGETS,
): ProductHealthRow[] {
	const grouped = new Map<
		string,
		{
			productName: string;
			serviceBucket: SupportServiceBucket;
			servicePolicyName: string;
			openItems: SupportCaseRecord[];
			periodItems: SupportCaseRecord[];
			periodResolvedItems: SupportCaseRecord[];
		}
	>();

	const visibleCases = cases.filter((item) => item.serviceBucket !== "unknown");

	for (const item of visibleCases) {
		const key = `${item.serviceBucket}:${item.productName}`;
		const current = grouped.get(key) ?? {
			productName: item.productName,
			serviceBucket: item.serviceBucket,
			servicePolicyName: item.servicePolicyName,
			openItems: [],
			periodItems: [],
			periodResolvedItems: [],
		};

		if (isActionableCase(item)) {
			current.openItems.push(item);
		}

		if (
			isWithinInterval(item.createdAt, { start: period.from, end: period.to })
		) {
			current.periodItems.push(item);
		}

		const resolvedAt = item.resolvedAt ?? item.updatedAt;
		if (
			item.actionableState === "resolved" &&
			isWithinInterval(resolvedAt, { start: period.from, end: period.to })
		) {
			current.periodResolvedItems.push(item);
		}

		grouped.set(key, current);
	}

	return Array.from(grouped.values())
		.filter(
			(group) => group.openItems.length > 0 || group.periodItems.length > 0,
		)
		.map((group) => {
			const awaitingTeamCount = group.openItems.filter(
				(item) =>
					item.actionableState === "awaiting-team" ||
					item.actionableState === "due-soon" ||
					item.actionableState === "breached",
			).length;
			const breachedNowCount = group.openItems.filter(
				(item) => item.isBreached,
			).length;
			const slaTracked = group.periodItems.filter(
				(item) => item.hasSlaTracking,
			);
			const slaMissedCount = slaTracked.filter((item) =>
				isSlaMissedForPeriod(item, now),
			).length;
			const rated = group.periodResolvedItems.filter(
				(item) => item.cxScore !== null,
			);
			const positiveCount = rated.filter(
				(item) => toFivePointRating(item.cxScore ?? 0) >= 4,
			).length;
			const positiveByAssignee = new Map<string, number>();
			for (const item of rated) {
				if (toFivePointRating(item.cxScore ?? 0) < 4) continue;
				if (!item.assigneeName || item.assigneeName.trim().length === 0)
					continue;
				positiveByAssignee.set(
					item.assigneeName,
					(positiveByAssignee.get(item.assigneeName) ?? 0) + 1,
				);
			}
			const topPerformer = Array.from(positiveByAssignee.entries()).sort(
				(left, right) => {
					if (right[1] !== left[1]) return right[1] - left[1];
					return left[0].localeCompare(right[0]);
				},
			)[0];

			return {
				productName: group.productName,
				serviceBucket: group.serviceBucket,
				servicePolicyName: group.servicePolicyName,
				targets: resolveTargets(group.productName),
				openNowCount: group.openItems.length,
				awaitingTeamCount,
				breachedNowCount,
				slaTrackedCount: slaTracked.length,
				slaAdherencePercent:
					slaTracked.length === 0
						? null
						: round(
								((slaTracked.length - slaMissedCount) / slaTracked.length) *
									100,
							),
				slaMissedCount,
				cxScore:
					rated.length === 0
						? null
						: round(
								rated.reduce((sum, item) => sum + (item.cxScore ?? 0), 0) /
									rated.length,
								2,
							),
				satisfactionScorePercent: toSatisfactionPercent(
					positiveCount,
					rated.length,
				),
				responseRatePercent:
					group.periodResolvedItems.length === 0
						? 0
						: round((rated.length / group.periodResolvedItems.length) * 100),
				ratedCount: rated.length,
				eligibleCount: group.periodResolvedItems.length,
				positiveCount,
				topPerformerName: topPerformer?.[0] ?? null,
				topPerformerPositiveCount: topPerformer?.[1] ?? 0,
			};
		})
		.sort((left, right) => {
			if (left.serviceBucket !== right.serviceBucket) {
				const order = { headline: 0, exception: 1, unknown: 2 };
				return order[left.serviceBucket] - order[right.serviceBucket];
			}

			const leftScore =
				left.breachedNowCount * 100 +
				left.openNowCount * 10 +
				(left.slaAdherencePercent === null
					? -1
					: 100 - left.slaAdherencePercent) *
					100 +
				(left.satisfactionScorePercent === null
					? 0
					: Math.max(0, 100 - left.satisfactionScorePercent));
			const rightScore =
				right.breachedNowCount * 100 +
				right.openNowCount * 10 +
				(right.slaAdherencePercent === null
					? -1
					: 100 - right.slaAdherencePercent) *
					100 +
				(right.satisfactionScorePercent === null
					? 0
					: Math.max(0, 100 - right.satisfactionScorePercent));
			if (rightScore !== leftScore) return rightScore - leftScore;
			return left.productName.localeCompare(right.productName);
		});
}

export function buildProductHealthSummary(
	rows: ProductHealthRow[],
	cases: SupportCaseRecord[],
	period: ResolvedSupportPeriod,
): ProductHealthSummary {
	const openNowCount = rows.reduce((sum, row) => sum + row.openNowCount, 0);
	const awaitingTeamNowCount = rows.reduce(
		(sum, row) => sum + row.awaitingTeamCount,
		0,
	);
	const breachedNowCount = rows.reduce(
		(sum, row) => sum + row.breachedNowCount,
		0,
	);
	const cx = buildCxAggregate(
		getPeriodEligibleCases(cases, period.from, period.to),
	);

	const slaMissedCount = rows.reduce((sum, row) => sum + row.slaMissedCount, 0);
	const slaTrackedCount = rows.reduce(
		(sum, row) => sum + row.slaTrackedCount,
		0,
	);

	return {
		openNowCount,
		awaitingTeamNowCount,
		breachedNowCount,
		slaAdherencePercent:
			slaTrackedCount === 0
				? null
				: round(((slaTrackedCount - slaMissedCount) / slaTrackedCount) * 100),
		slaTrackedCount,
		slaMissedCount,
		cxScore: cx.score,
		satisfactionScorePercent: cx.satisfactionScorePercent,
		responseRatePercent: cx.responseRatePercent,
		ratedCount: cx.ratedCount,
		eligibleCount: cx.eligibleCount,
		positiveCount: cx.positiveCount,
		ratingMix: cx.ratingMix,
	};
}

/**
 * Daily CX trend: average CX rating on the 1–5 scale per day.
 * (cxScore is stored normalised to 0–10; we halve it here so the chart
 * reads in natural star-rating terms.)
 *
 * When the window spans more than ~45 days (e.g. year-to-date) we bucket
 * by week to keep the chart readable.
 */
export function buildCxSeries(
	cases: SupportCaseRecord[],
	start: Date,
	end: Date,
): TrendPoint[] {
	const days = eachDayOfInterval({ start, end: endOfDay(end) });
	const useWeekly = days.length > 45;
	const labelFormat = days.length > 14 ? "d MMM" : "EEE d";

	if (!useWeekly) {
		return days.map((day) => {
			const dayEnd = endOfDay(day);
			const rated = cases.filter((item) => {
				if (item.subtype !== "conversation") return false;
				if (item.actionableState !== "resolved") return false;
				if (item.cxScore === null) return false;
				const resolvedAt = item.resolvedAt ?? item.updatedAt;
				return isWithinInterval(resolvedAt, { start: day, end: dayEnd });
			});
			if (rated.length === 0) {
				return { label: format(day, labelFormat), value: null };
			}
			const sum = rated.reduce((acc, item) => acc + (item.cxScore ?? 0), 0);
			// cxScore is on 0–10 scale; divide by 2 to get 1–5 stars.
			const avgFive = sum / rated.length / 2;
			return {
				label: format(day, labelFormat),
				value: Math.round(avgFive * 10) / 10,
			};
		});
	}

	// Weekly buckets for long ranges.
	const buckets: Array<{
		label: string;
		start: Date;
		end: Date;
		scores: number[];
	}> = [];
	let cursor = startOfDay(start);
	const endBoundary = endOfDay(end);
	while (cursor <= endBoundary) {
		const bucketEnd = new Date(cursor);
		bucketEnd.setDate(bucketEnd.getDate() + 6);
		const clipped = bucketEnd > endBoundary ? endBoundary : bucketEnd;
		buckets.push({
			label: format(cursor, "d MMM"),
			start: new Date(cursor),
			end: clipped,
			scores: [],
		});
		cursor = new Date(clipped);
		cursor.setDate(cursor.getDate() + 1);
	}
	for (const item of cases) {
		if (item.subtype !== "conversation") continue;
		if (item.actionableState !== "resolved") continue;
		if (item.cxScore === null) continue;
		const resolvedAt = item.resolvedAt ?? item.updatedAt;
		if (resolvedAt < start || resolvedAt > endBoundary) continue;
		const bucket = buckets.find(
			(b) => resolvedAt >= b.start && resolvedAt <= b.end,
		);
		if (bucket) bucket.scores.push(item.cxScore);
	}
	return buckets.map((b) => ({
		label: b.label,
		value:
			b.scores.length === 0
				? null
				: Math.round(
						(b.scores.reduce((s, v) => s + v, 0) / b.scores.length / 2) * 10,
					) / 10,
	}));
}

function collectTagCounts(cases: SupportCaseRecord[]) {
	const counts = new Map<string, number>();
	for (const item of cases) {
		for (const tag of item.tags) {
			if (!tag) continue;
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return counts;
}

export function buildThemeTrends(
	cases: SupportCaseRecord[],
	currentStart: Date,
	currentEnd: Date,
) {
	const periodDays = Math.max(
		1,
		differenceInCalendarDays(currentEnd, currentStart) + 1,
	);
	const previousEnd = new Date(currentStart.getTime() - 1);
	const previousStart = startOfDay(subDays(currentStart, periodDays));

	const currentCases = cases.filter(
		(item) =>
			isActionableCase(item) &&
			isWithinInterval(item.createdAt, {
				start: currentStart,
				end: currentEnd,
			}),
	);
	const previousCases = cases.filter(
		(item) =>
			isActionableCase(item) &&
			isWithinInterval(item.createdAt, {
				start: previousStart,
				end: previousEnd,
			}),
	);

	const currentCounts = collectTagCounts(currentCases);
	const previousCounts = collectTagCounts(previousCases);

	return Array.from(currentCounts.entries())
		.map(([label, currentCount]) => ({
			label,
			currentCount,
			previousCount: previousCounts.get(label) ?? 0,
			delta: currentCount - (previousCounts.get(label) ?? 0),
		}))
		.sort((left, right) => {
			if (right.delta !== left.delta) return right.delta - left.delta;
			return right.currentCount - left.currentCount;
		})
		.slice(0, 5);
}

export function buildQueuePressure(
	cases: SupportCaseRecord[],
	currentStart: Date,
	currentEnd: Date,
) {
	const periodDays = Math.max(
		1,
		differenceInCalendarDays(currentEnd, currentStart) + 1,
	);
	const previousEnd = new Date(currentStart.getTime() - 1);
	const previousStart = startOfDay(subDays(currentStart, periodDays));

	const countByTeam = (items: SupportCaseRecord[]) => {
		const counts = new Map<string, number>();
		for (const item of items) {
			counts.set(item.productName, (counts.get(item.productName) ?? 0) + 1);
		}
		return counts;
	};

	const currentCounts = countByTeam(
		cases.filter(
			(item) =>
				isActionableCase(item) &&
				isWithinInterval(item.createdAt, {
					start: currentStart,
					end: currentEnd,
				}),
		),
	);
	const previousCounts = countByTeam(
		cases.filter(
			(item) =>
				isActionableCase(item) &&
				isWithinInterval(item.createdAt, {
					start: previousStart,
					end: previousEnd,
				}),
		),
	);

	return Array.from(currentCounts.entries())
		.map(([teamName, currentOpenCount]) => ({
			teamName,
			currentOpenCount,
			previousOpenCount: previousCounts.get(teamName) ?? 0,
			delta: currentOpenCount - (previousCounts.get(teamName) ?? 0),
		}))
		.sort((left, right) => right.delta - left.delta)
		.slice(0, 4);
}

export function buildReopenTrend(
	cases: SupportCaseRecord[],
	start: Date,
	end: Date,
) {
	const days = eachDayOfInterval({ start, end: endOfDay(end) });
	return days.map((day) => {
		const dayEnd = endOfDay(day);
		const reopenCount = cases
			.filter((item) =>
				isWithinInterval(item.updatedAt, { start: day, end: dayEnd }),
			)
			.reduce((sum, item) => sum + item.reopenCount, 0);

		return {
			label: format(day, "d MMM"),
			value: reopenCount,
		};
	});
}

export function buildLiveWallboardData(
	cases: SupportCaseRecord[],
	lastSyncAt: Date | null,
	now: Date,
): LiveWallboardPayload {
	const actionableLookupPoolLimit = Math.min(
		100,
		Math.max(20, cases.filter((item) => isActionableCase(item)).length),
	);
	const snapshot = buildSupportHealthSnapshot(cases, lastSyncAt, now);
	const queues = buildQueueHealth(cases, now, "headline");
	const exceptionQueues = buildQueueHealth(cases, now, "exception");
	const unknownQueues = buildQueueHealth(cases, now, "unknown");
	const mappedQueues = sortQueuesByRisk([...queues, ...exceptionQueues]);
	const statusBreakdown: CaseStatusBreakdown = {
		open: cases.filter((item) => item.status === "open").length,
		pending: cases.filter((item) => item.status === "pending").length,
		resolved: cases.filter((item) => item.status === "resolved").length,
		closed: cases.filter((item) => item.status === "closed").length,
	};
	return {
		snapshot,
		peopleMoments: buildPeopleMoments(cases, now),
		statusBreakdown,
		mappedQueues,
		queues,
		exceptionQueues,
		unknownQueues,
		unknownSignals: buildUnknownSignals(cases),
		actionItems: buildCoverageActionItems(mappedQueues),
		lookupCases: buildLookupCases(cases, now, actionableLookupPoolLimit),
		volumeSlaSeries30d: buildDailyVolumeSlaSeries(cases, now, 30),
		refreshedAt: now.toISOString(),
	};
}

function filterNpsByPeriod(
	records: NpsRecord[],
	from: Date,
	to: Date,
): NpsRecord[] {
	return records.filter((record) => {
		if (!record.ratedAt) return false;
		return isWithinInterval(record.ratedAt, { start: from, end: to });
	});
}

export function buildNpsSummary(
	records: NpsRecord[],
	period: ResolvedSupportPeriod,
): NpsPeriodSummary {
	const current = filterNpsByPeriod(records, period.from, period.to);
	const windowMs = Math.max(1, period.to.getTime() - period.from.getTime());
	const previousStart = new Date(period.from.getTime() - windowMs);
	const previousEnd = new Date(period.from.getTime() - 1);
	const previous = filterNpsByPeriod(records, previousStart, previousEnd);

	const scores = current.map((r) => r.score);
	const currentScore = calculateNps(scores);
	const previousScoreValue =
		previous.length > 0 ? calculateNps(previous.map((r) => r.score)) : null;
	const averageScore = averageNpsRating(scores);

	let promoterCount = 0;
	let passiveCount = 0;
	let detractorCount = 0;
	for (const r of current) {
		if (r.bucket === "promoter") promoterCount++;
		else if (r.bucket === "passive") passiveCount++;
		else detractorCount++;
	}

	return {
		periodLabel: period.range.label,
		score: currentScore,
		previousScore: previousScoreValue,
		delta:
			previousScoreValue === null ? null : currentScore - previousScoreValue,
		promoterCount,
		passiveCount,
		detractorCount,
		responseCount: current.length,
		averageScore,
	};
}

export function buildNpsSeries(
	records: NpsRecord[],
	from: Date,
	to: Date,
): TrendPoint[] {
	const current = filterNpsByPeriod(records, from, to);
	if (current.length === 0) {
		return [];
	}
	const days = eachDayOfInterval({
		start: startOfDay(from),
		end: endOfDay(to),
	});
	// Downsample to weekly buckets for long ranges. Also align daily label
	// formatting with buildCxSeries.
	const useWeekly = days.length > 45;
	const dailyLabelFormat = days.length > 14 ? "d MMM" : "EEE d";
	const buckets: Array<{
		label: string;
		start: Date;
		end: Date;
		scores: number[];
	}> = [];

	if (useWeekly) {
		let cursor = startOfDay(from);
		const endBoundary = endOfDay(to);
		while (cursor <= endBoundary) {
			const bucketEnd = new Date(cursor);
			bucketEnd.setDate(bucketEnd.getDate() + 6);
			const clipped = bucketEnd > endBoundary ? endBoundary : bucketEnd;
			buckets.push({
				label: format(cursor, "d MMM"),
				start: new Date(cursor),
				end: clipped,
				scores: [],
			});
			cursor = new Date(clipped);
			cursor.setDate(cursor.getDate() + 1);
		}
	} else {
		for (const day of days) {
			buckets.push({
				label: format(day, dailyLabelFormat),
				start: startOfDay(day),
				end: endOfDay(day),
				scores: [],
			});
		}
	}

	for (const record of current) {
		const ratedAt = record.ratedAt;
		if (!ratedAt) continue;
		const bucket = buckets.find((b) => ratedAt >= b.start && ratedAt <= b.end);
		if (bucket) bucket.scores.push(record.score);
	}

	return buckets.map((b) => ({
		label: b.label,
		value: b.scores.length === 0 ? null : calculateNps(b.scores),
	}));
}

export interface TeammateLookupEntry {
	name: string;
	avatarUrl: string | null;
}

export function buildTopContributors(
	cases: SupportCaseRecord[],
	period: ResolvedSupportPeriod,
	teammateLookup?: Map<string, TeammateLookupEntry>,
): TopContributorsSummary {
	// A rating is eligible only if:
	//  - it's a conversation (not a ticket)
	//  - it was resolved AND we have the resolvedAt timestamp (no updatedAt
	//    fallback — that bumps on every sync and leaks historical ratings into
	//    the current period)
	//  - resolvedAt falls inside the selected period
	//  - the customer actually rated it (cxScore !== null)
	const eligible = cases.filter((item) => {
		if (item.subtype !== "conversation") return false;
		if (item.actionableState !== "resolved") return false;
		if (item.cxScore === null) return false;
		if (item.resolvedAt === null) return false;
		return isWithinInterval(item.resolvedAt, {
			start: period.from,
			end: period.to,
		});
	});

	let totalPositive = 0;

	const byPerson = new Map<
		string,
		{
			name: string;
			avatarUrl: string | null;
			positiveCount: number;
			productCounts: Map<string, number>;
		}
	>();

	for (const item of eligible) {
		const rating = toFivePointRating(item.cxScore ?? 0);
		if (rating < 4) continue;
		totalPositive += 1;

		// Prefer the teammate the customer actually rated (Intercom's
		// `conversation_rating.teammate.id`), fall back to current assignee.
		const ratedEntry = item.ratedTeammateExternalId
			? teammateLookup?.get(item.ratedTeammateExternalId)
			: undefined;
		const name = (ratedEntry?.name ?? item.assigneeName ?? "").trim();
		if (!name) continue;
		const avatarUrl = ratedEntry?.avatarUrl ?? item.assigneeAvatarUrl ?? null;

		const existing = byPerson.get(name) ?? {
			name,
			avatarUrl,
			positiveCount: 0,
			productCounts: new Map<string, number>(),
		};
		existing.positiveCount += 1;
		existing.productCounts.set(
			item.productName,
			(existing.productCounts.get(item.productName) ?? 0) + 1,
		);
		byPerson.set(name, existing);
	}

	const contributors = [...byPerson.values()]
		.sort((a, b) => b.positiveCount - a.positiveCount)
		.slice(0, 5)
		.map((entry) => {
			// Representative product: pick the top one, but skip "Unmapped"
			// (classifier couldn't identify the product — don't attribute).
			const topProduct =
				[...entry.productCounts.entries()]
					.filter(([product]) => product !== "Unmapped")
					.sort((a, b) => b[1] - a[1])[0] ?? null;
			return {
				name: entry.name,
				avatarUrl: entry.avatarUrl,
				positiveCount: entry.positiveCount,
				representativeProduct: topProduct ? topProduct[0] : null,
			};
		});

	return {
		contributors,
		totalRated: eligible.length,
		totalPositive,
	};
}

export function buildTrendsTickerItems(input: {
	period: ResolvedSupportPeriod;
	cases: SupportCaseRecord[];
	npsSummary: NpsPeriodSummary;
	npsThemes: NpsTheme[];
	topContributors: TopContributorsSummary;
	productHealth: ProductHealthRow[];
}): string[] {
	const {
		period,
		cases,
		npsSummary,
		npsThemes,
		topContributors,
		productHealth,
	} = input;
	const label = period.range.label;
	const lower = label.toLowerCase();

	// Require a real `resolvedAt` — drop the `updatedAt` fallback so historical
	// conversations don't leak into the current period via sync touches.
	const windowCases = cases.filter((c) => {
		if (c.resolvedAt === null) return false;
		return isWithinInterval(c.resolvedAt, {
			start: period.from,
			end: period.to,
		});
	});
	const resolved = windowCases.filter((c) => c.actionableState === "resolved");
	const ratedPositive = resolved.filter((c) => {
		if (c.cxScore === null) return false;
		return toFivePointRating(c.cxScore) >= 4;
	});
	const cxAgg = buildCxAggregate(resolved);
	const items: string[] = [];

	items.push(
		`${label}: ${resolved.length} case${resolved.length === 1 ? "" : "s"} resolved · CX ${
			cxAgg.satisfactionScorePercent === null
				? "—"
				: `${cxAgg.satisfactionScorePercent}%`
		} · NPS ${formatNpsScore(npsSummary.score)} from ${npsSummary.responseCount} response${npsSummary.responseCount === 1 ? "" : "s"}`,
	);

	if (npsSummary.delta !== null && npsSummary.delta !== 0) {
		items.push(
			`NPS ${npsSummary.delta > 0 ? "up" : "down"} ${Math.abs(
				npsSummary.delta,
			)} point${Math.abs(npsSummary.delta) === 1 ? "" : "s"} vs previous ${lower}`,
		);
	}

	if (ratedPositive.length > 0) {
		items.push(
			`${ratedPositive.length} positive CX rating${
				ratedPositive.length === 1 ? "" : "s"
			} this ${lower.replace(/^current /, "").replace(/^past /, "")}`,
		);
	}

	const topContributor = topContributors.contributors[0];
	if (topContributor && topContributor.positiveCount > 0) {
		items.push(
			`${topContributor.name}: ${topContributor.positiveCount} of ${topContributors.totalRated} positive rating${
				topContributors.totalRated === 1 ? "" : "s"
			} this ${lower.replace(/^current /, "").replace(/^past /, "")}`,
		);
	}

	const topProduct = productHealth
		.filter((row) => row.positiveCount > 0)
		.sort((a, b) => b.positiveCount - a.positiveCount)[0];
	if (topProduct) {
		items.push(
			`${topProduct.productName}: ${topProduct.positiveCount} positive rating${
				topProduct.positiveCount === 1 ? "" : "s"
			} this ${lower.replace(/^current /, "").replace(/^past /, "")}`,
		);
	}

	const positiveTheme = npsThemes.find((t) => t.sentiment === "positive");
	if (positiveTheme) {
		items.push(`Customer voice: ${positiveTheme.headline}`);
	}
	const negativeTheme = npsThemes.find((t) => t.sentiment === "negative");
	if (negativeTheme) {
		items.push(`Area to watch: ${negativeTheme.headline}`);
	}

	return items.slice(0, 8);
}

function formatNpsScore(score: number): string {
	if (score > 0) return `+${score}`;
	return String(score);
}

export function buildTrendsWallboardData(
	cases: SupportCaseRecord[],
	lastSyncAt: Date | null,
	now: Date,
	period: ResolvedSupportPeriod,
	resolveTargets: (productName: string) => SupportPerformanceTargets = () =>
		DEFAULT_SUPPORT_TARGETS,
): TrendsWallboardPayload {
	const snapshot = buildSupportHealthSnapshot(cases, lastSyncAt, now);
	const headlineCases = filterCasesByBucket(cases, "headline");
	const productHealth = buildProductHealthRows(
		cases,
		period,
		now,
		resolveTargets,
	);
	return {
		snapshot,
		period: period.range,
		periodSummary: buildProductHealthSummary(productHealth, cases, period),
		productHealth,
		periods: [
			buildCxPeriodSummary(
				cases,
				"Month",
				startOfMonth(now),
				now,
				subMonths(startOfMonth(now), 1),
				subDays(startOfMonth(now), 1),
			),
			buildCxPeriodSummary(
				cases,
				"Quarter",
				startOfQuarter(now),
				now,
				subQuarters(startOfQuarter(now), 1),
				subDays(startOfQuarter(now), 1),
			),
			buildCxPeriodSummary(
				cases,
				"Year",
				startOfYear(now),
				now,
				subYears(startOfYear(now), 1),
				subDays(startOfYear(now), 1),
			),
		],
		cxSeries: buildCxSeries(cases, period.from, period.to),
		themeTrends: buildThemeTrends(cases, period.from, period.to),
		queuePressure: buildQueuePressure(headlineCases, period.from, period.to),
		reopenTrend: buildReopenTrend(cases, period.from, period.to),
		exceptionQueues: buildQueueHealth(cases, now, "exception"),
		unknownQueues: buildQueueHealth(cases, now, "unknown"),
		lookupCases: buildLookupCases(cases, now),
		refreshedAt: now.toISOString(),
	};
}
