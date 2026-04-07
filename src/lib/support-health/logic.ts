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
	LiveWallboardData,
	ProductHealthRow,
	ProductHealthSummary,
	QueueHealth,
	SupportCasePriority,
	SupportCaseRecord,
	SupportHealthSnapshot,
	SupportServiceBucket,
	SupportTier,
	SupportWorkflowCounts,
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
	| "defaultTargets"
	| "selectedTargets"
	| "productTargets"
	| "intercomAppUrl"
	| "availableProducts"
	| "selectedProducts"
	| "focusPlan"
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
>;

const GENERIC_QUEUE_NAMES = new Set([
	"general",
	"support",
	"customer support",
	"shared inbox",
	"inbox",
	"team inbox",
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

	const slaTrackedCases = activeCases.filter(
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

function hashSeed(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pickBySeed<T>(seed: string, values: T[]) {
	if (values.length === 0) {
		throw new Error("pickBySeed requires at least one option");
	}
	return values[hashSeed(seed) % values.length] as T;
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

	for (const item of recentRated.slice(0, 4)) {
		const assignee = item.assigneeName?.trim();
		if (!assignee) continue;
		const rating = toFivePointRating(item.cxScore ?? 0);
		const productLabel = formatMomentProductName(item.productName);
		const positiveTemplate = pickBySeed(`${item.externalId}:cx-positive`, [
			`${assignee} turned another ${productLabel} conversation into a ${rating}/5 CX win.`,
			`Spotlight on ${assignee}: ${rating}/5 CX delivered in ${productLabel}.`,
			`Customer love in ${productLabel}: ${assignee} landed a ${rating}/5 CX result.`,
		]);
		const mixedTemplate = pickBySeed(`${item.externalId}:cx-mixed`, [
			`${assignee} received ${rating}/5 CX in ${productLabel}. Keep the feedback loop moving.`,
			`${assignee} got a ${rating}/5 CX signal in ${productLabel}. Worth a quick review.`,
		]);
		const lowTemplate = pickBySeed(`${item.externalId}:cx-low`, [
			`${assignee} received ${rating}/5 CX in ${productLabel}. Follow-up is recommended.`,
			`Recovery signal for ${assignee}: ${rating}/5 CX in ${productLabel}.`,
		]);

		if (rating >= 4) {
			push(positiveTemplate);
			const topic = inferCaseTopic(item);
			if (topic) {
				const topicTemplate = pickBySeed(`${item.externalId}:${topic}:topic`, [
					`${assignee} just helped a customer with ${topic} in ${productLabel}.`,
					`${assignee} moved a ${topic} case forward in ${productLabel}.`,
					`${assignee} supported a customer on ${topic} in ${productLabel}.`,
				]);
				push(topicTemplate);
			}
			continue;
		}

		if (rating <= 2) {
			push(lowTemplate);
			continue;
		}

		push(mixedTemplate);
	}

	const urgentAssigned = [...cases]
		.filter(
			(item) =>
				isActionableCase(item) &&
				item.hasAssignment &&
				!!item.assigneeName &&
				(item.isBreached || item.isDueSoon),
		)
		.sort((left, right) => compareLookupCases(left, right, now));

	for (const item of urgentAssigned.slice(0, 3)) {
		const assignee = item.assigneeName?.trim();
		if (!assignee) continue;
		const productLabel = formatMomentProductName(item.productName);
		if (item.isBreached) {
			const urgentTemplate = pickBySeed(`${item.externalId}:urgent`, [
				`Action now: ${assignee} owns an over-SLA case in ${productLabel}.`,
				`Priority lane: ${assignee} has an over-SLA reply pending in ${productLabel}.`,
				`Escalation focus: ${assignee} should pick up an over-SLA case in ${productLabel}.`,
			]);
			push(urgentTemplate);
			continue;
		}
		const dueSoonTemplate = pickBySeed(`${item.externalId}:due-soon`, [
			`Heads-up for ${assignee}: one case is due within 60 minutes in ${productLabel}.`,
			`${assignee} has a near-deadline case in ${productLabel} due inside the hour.`,
			`${productLabel}: ${assignee} owns a case approaching SLA in the next 60 minutes.`,
		]);
		push(dueSoonTemplate);
	}

	const unassignedByProduct = new Map<string, number>();
	for (const item of cases) {
		if (!isActionableCase(item) || item.hasAssignment) continue;
		const key = formatMomentProductName(item.productName);
		unassignedByProduct.set(key, (unassignedByProduct.get(key) ?? 0) + 1);
	}

	for (const [productLabel, count] of [...unassignedByProduct.entries()]
		.sort((left, right) => right[1] - left[1])
		.slice(0, 3)) {
		const unassignedTemplate = pickBySeed(
			`${productLabel}:${count}:unassigned`,
			[
				`Team assist needed: ${productLabel} has ${asCount(count, "unassigned case")} waiting for an owner.`,
				`${productLabel} needs assignment help: ${asCount(count, "case")} are unassigned.`,
				`Ownership gap in ${productLabel}: ${asCount(count, "case")} still unassigned.`,
			],
		);
		push(unassignedTemplate);
	}

	return messages.slice(0, 10);
}

export function buildLookupCases(
	cases: SupportCaseRecord[],
	now: Date,
	limit = 5,
): CaseLookupItem[] {
	return [...cases]
		.filter(isActionableCase)
		.sort((left, right) => compareLookupCases(left, right, now))
		.slice(0, limit)
		.map((item) => {
			return {
				id: item.id,
				externalId: item.externalId,
				productName: item.productName || "Unmapped",
				queueName: item.teamName,
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

export function buildCxSeries(
	cases: SupportCaseRecord[],
	start: Date,
	end: Date,
): TrendPoint[] {
	const days = eachDayOfInterval({ start, end: endOfDay(end) });
	return days.map((day) => {
		const dayEnd = endOfDay(day);
		const rated = cases.filter((item) => {
			if (item.subtype !== "conversation") return false;
			if (item.actionableState !== "resolved") return false;
			if (item.cxScore === null) return false;
			const resolvedAt = item.resolvedAt ?? item.updatedAt;
			return isWithinInterval(resolvedAt, { start: day, end: dayEnd });
		});
		const positiveCount = rated.filter(
			(item) => toFivePointRating(item.cxScore ?? 0) >= 4,
		).length;

		return {
			label: format(day, "d"),
			value: toSatisfactionPercent(positiveCount, rated.length),
		};
	});
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
		lookupCases: buildLookupCases(cases, now),
		refreshedAt: now.toISOString(),
	};
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
		peopleMoments: buildPeopleMoments(cases, now, {
			periodStart: period.from,
			periodEnd: period.to,
		}),
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
