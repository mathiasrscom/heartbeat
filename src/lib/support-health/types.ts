import type { SupportPerformanceTargets } from "./targets";

export type SupportHealthStatus = "green" | "yellow" | "red";

export type ActionableState =
	| "awaiting-team"
	| "awaiting-customer"
	| "unassigned"
	| "due-soon"
	| "breached"
	| "resolved";

export type SupportCasePriority = "low" | "normal" | "high" | "urgent";
export type SupportCaseSubtype = "conversation" | "ticket";
export type SupportTier = "free" | "starter" | "pro" | "enterprise" | "unknown";
export type SupportServiceBucket = "headline" | "exception" | "unknown";
export type SupportPeriodPreset =
	| "current-week"
	| "previous-week"
	| "current-month"
	| "previous-month"
	| "year-to-date"
	| "custom";

export interface SupportCaseRecord {
	id: string;
	externalId: string;
	source: string;
	subtype: SupportCaseSubtype;
	status: string;
	priority: SupportCasePriority;
	title: string | null;
	description: string | null;
	tags: string[];
	teamName: string;
	productName: string;
	serviceBucket: SupportServiceBucket;
	servicePolicyName: string;
	productViewNames?: string[];
	assigneeName: string | null;
	assigneeAvatarUrl: string | null;
	hasAssignment: boolean;
	customerTier: SupportTier;
	createdAt: Date;
	updatedAt: Date;
	resolvedAt: Date | null;
	waitingSinceAt: Date | null;
	nextDueAt: Date | null;
	rawSlaStatus: string | null;
	hasSlaTracking: boolean;
	cxScore: number | null;
	cxComment: string | null;
	/**
	 * Intercom admin externalId identified by `conversation_rating.teammate.id`
	 * — i.e. the teammate the customer actually rated. This is the authoritative
	 * attribution for CX credit (distinct from `assigneeName`, which is the
	 * *current* assignee and can change after the rating).
	 */
	ratedTeammateExternalId: string | null;
	responseTimeMinutes: number | null;
	resolutionTimeHours: number | null;
	reopenCount: number;
	actionableState: ActionableState;
	isBreached: boolean;
	isDueSoon: boolean;
	isHighRisk: boolean;
	isDeveloperTicket: boolean;
	isTicketReview: boolean;
	isAssignedToDeveloperTeam: boolean;
}

export interface SupportWorkflowCounts {
	ticketReviewCount: number;
	developerTeamAssignedCount: number;
}

export interface SupportHealthSnapshot {
	status: SupportHealthStatus;
	statusLabel: string;
	activeCaseCount: number;
	currentActiveCaseCount: number;
	slaAdherencePercent: number;
	dueSoonCount: number;
	currentDueSoonCount: number;
	breachedCount: number;
	currentBreachedCount: number;
	unassignedCount: number;
	currentUnassignedCount: number;
	urgentHighRiskCount: number;
	currentUrgentHighRiskCount: number;
	awaitingTeamCount: number;
	currentAwaitingTeamCount: number;
	awaitingCustomerCount: number;
	currentAwaitingCustomerCount: number;
	exceptionCaseCount: number;
	exceptionBreachedCount: number;
	unknownCaseCount: number;
	unknownBreachedCount: number;
	oldestActionableAgeMinutes: number | null;
	oldestExceptionAgeMinutes: number | null;
	freshnessTimestamp: string | null;
	stale: boolean;
}

export interface QueueHealth {
	teamName: string;
	sourceQueues: string[];
	serviceBucket: SupportServiceBucket;
	servicePolicyName: string;
	activeCaseCount: number;
	awaitingTeamCount: number;
	dueSoonCount: number;
	breachedCount: number;
	unassignedCount: number;
	urgentCount: number;
	enterpriseCount: number;
	oldestActionableAgeMinutes: number | null;
	priorityMix: Record<SupportCasePriority, number>;
}

export interface ActionItem {
	id: string;
	severity: "yellow" | "red";
	label: string;
	detail: string;
	queueName: string;
}

export interface CaseLookupItem {
	id: string;
	externalId: string;
	productName: string;
	queueName: string;
	assigneeName: string | null;
	assigneeAvatarUrl: string | null;
	subtype: SupportCaseSubtype;
	stateLabel: string;
	ageLabel: string;
	isBreached: boolean;
	isDueSoon: boolean;
	isHighRisk: boolean;
}

export interface CxPeriodSummary {
	label: string;
	score: number | null;
	satisfactionScorePercent: number | null;
	responseRatePercent: number;
	ratedCount: number;
	eligibleCount: number;
	positiveCount: number;
	ratingMix: Record<1 | 2 | 3 | 4 | 5, number>;
	deltaFromPrevious: number | null;
}

export interface TrendPoint {
	label: string;
	value: number | null;
}

export interface CaseStatusBreakdown {
	open: number;
	pending: number;
	resolved: number;
	closed: number;
}

export interface ThemeTrend {
	label: string;
	currentCount: number;
	previousCount: number;
	delta: number;
}

export interface ClassificationHint {
	label: string;
	count: number;
	kind: "tag" | "queue";
}

export interface QueuePressure {
	teamName: string;
	currentOpenCount: number;
	previousOpenCount: number;
	delta: number;
}

export interface SupportPeriodRange {
	preset: SupportPeriodPreset;
	label: string;
	from: string;
	to: string;
}

export interface ProductHealthRow {
	productName: string;
	serviceBucket: SupportServiceBucket;
	servicePolicyName: string;
	targets: SupportPerformanceTargets;
	openNowCount: number;
	awaitingTeamCount: number;
	breachedNowCount: number;
	slaTrackedCount: number;
	slaAdherencePercent: number | null;
	slaMissedCount: number;
	cxScore: number | null;
	satisfactionScorePercent: number | null;
	responseRatePercent: number;
	ratedCount: number;
	eligibleCount: number;
	positiveCount: number;
	topPerformerName: string | null;
	topPerformerPositiveCount: number;
}

export interface ProductHealthSummary {
	openNowCount: number;
	awaitingTeamNowCount: number;
	breachedNowCount: number;
	slaTrackedCount: number;
	slaMissedCount: number;
	slaAdherencePercent: number | null;
	cxScore: number | null;
	satisfactionScorePercent: number | null;
	responseRatePercent: number;
	ratedCount: number;
	eligibleCount: number;
	positiveCount: number;
	ratingMix: Record<1 | 2 | 3 | 4 | 5, number>;
}

export type LiveFocusLane = "over-sla" | "due-soon" | "unassigned";

export interface LiveWallboardFocusPlan {
	generatedAt: string;
	source: "deterministic" | "ollama";
	model: string | null;
	focusProductName: string | null;
	headline: string;
	supportingText: string;
	topCaseExternalIds: string[];
	laneOrder: LiveFocusLane[];
}

export interface LiveWallboardData {
	snapshot: SupportHealthSnapshot;
	workflowCounts: SupportWorkflowCounts;
	defaultTargets: SupportPerformanceTargets;
	selectedTargets: SupportPerformanceTargets;
	productTargets: Record<string, SupportPerformanceTargets>;
	intercomAppUrl: string | null;
	availableProducts: string[];
	selectedProducts: string[];
	focusPlan?: LiveWallboardFocusPlan | null;
	peopleMoments: string[];
	statusBreakdown: CaseStatusBreakdown;
	mappedQueues: QueueHealth[];
	queues: QueueHealth[];
	exceptionQueues: QueueHealth[];
	unknownQueues: QueueHealth[];
	unknownSignals: ClassificationHint[];
	actionItems: ActionItem[];
	lookupCases: CaseLookupItem[];
	refreshedAt: string;
	wallboardTheme: "light" | "dark";
	insights: import("@/lib/wallboard-insights").ProductInsight[];
}

export interface NpsRecord {
	entityId: string;
	name: string | null;
	score: number;
	comment: string | null;
	ratedAt: Date | null;
	bucket: "promoter" | "passive" | "detractor";
}

export interface NpsPeriodSummary {
	periodLabel: string;
	score: number;
	previousScore: number | null;
	delta: number | null;
	promoterCount: number;
	passiveCount: number;
	detractorCount: number;
	responseCount: number;
	averageScore: number | null;
}

export interface NpsTheme {
	headline: string;
	summary: string;
	sentiment: "positive" | "mixed" | "negative";
	quote: string | null;
	mentionCount: number;
}

export interface TopContributor {
	name: string;
	avatarUrl: string | null;
	positiveCount: number;
	representativeProduct: string | null;
}

export interface TopContributorsSummary {
	contributors: TopContributor[];
	/** Total resolved+rated conversations in scope (the denominator). */
	totalRated: number;
	/** Total of those that were ≥4 on the 1–5 scale. */
	totalPositive: number;
}

export interface TrendsWallboardData {
	snapshot: SupportHealthSnapshot;
	workflowCounts: SupportWorkflowCounts;
	defaultTargets: SupportPerformanceTargets;
	selectedTargets: SupportPerformanceTargets;
	productTargets: Record<string, SupportPerformanceTargets>;
	intercomAppUrl: string | null;
	availableProducts: string[];
	selectedProducts: string[];
	period: SupportPeriodRange;
	periodSummary: ProductHealthSummary;
	productHealth: ProductHealthRow[];
	periods: CxPeriodSummary[];
	cxSeries: TrendPoint[];
	themeTrends: ThemeTrend[];
	queuePressure: QueuePressure[];
	reopenTrend: TrendPoint[];
	exceptionQueues: QueueHealth[];
	unknownQueues: QueueHealth[];
	lookupCases: CaseLookupItem[];
	refreshedAt: string;
	wallboardTheme: "light" | "dark";
	insights: import("@/lib/wallboard-insights").ProductInsight[];
	npsSummary: NpsPeriodSummary;
	npsSeries: TrendPoint[];
	npsDistribution: { promoter: number; passive: number; detractor: number };
	npsComments: string[];
	npsThemes: NpsTheme[];
	/**
	 * Per-product NPS slices. Keyed by product name. Only includes products
	 * that have at least one linked NPS response. When a product is focused
	 * on the wallboard, read the slice here; fall back to the global fields
	 * above only when no product is focused.
	 */
	npsByProduct: Record<
		string,
		{
			summary: NpsPeriodSummary;
			series: TrendPoint[];
			distribution: { promoter: number; passive: number; detractor: number };
			comments: string[];
			themes: NpsTheme[];
		}
	>;
	topContributors: TopContributorsSummary;
	topContributorsByProduct: Record<string, TopContributorsSummary>;
	tickerItems: string[];
}
