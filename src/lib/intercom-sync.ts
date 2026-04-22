/**
 * Intercom Sync Logic
 *
 * Syncs conversations, tickets, contacts, and team members from Intercom
 * into the local database for wallboard reporting.
 */

import { and, eq, inArray, isNull, notLike, or } from "drizzle-orm";
import { db } from "@/db";
import {
	adapterConfigs,
	entities,
	nodes,
	syncState,
	teamMembers,
} from "@/db/schema";
import {
	createIntercomClient,
	isIntercomApiError,
	type IntercomAdmin,
	type IntercomContact,
	type IntercomConversation,
	type IntercomTicket,
} from "./intercom";
import { extractIntercomCx } from "./intercom-cx";
import {
	claimIntercomSyncRuntime,
	finishIntercomSyncRuntime,
	updateIntercomSyncRuntime,
} from "./intercom-sync-runtime";

interface SyncResult {
	success: boolean;
	skipped?: boolean;
	nodesSynced: number;
	entitiesSynced: number;
	teamMembersSynced: number;
	errors: string[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAppUrl(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function getConfiguredIntercomAppUrl() {
	const configRow = await db
		.select({ settings: adapterConfigs.settings })
		.from(adapterConfigs)
		.where(eq(adapterConfigs.adapterId, "intercom"))
		.limit(1);

	const settings = isRecord(configRow[0]?.settings)
		? configRow[0].settings
		: {};
	return (
		normalizeAppUrl(settings.appUrl) ??
		normalizeAppUrl(process.env.INTERCOM_APP_URL)
	);
}

async function runIntercomSync(accessToken: string): Promise<SyncResult> {
	const appUrl = await getConfiguredIntercomAppUrl();
	const client = createIntercomClient({ accessToken, appUrl });
	const errors: string[] = [];
	const teamNamesById = new Map<string, string>();
	const entityIdCache = new Map<string, string | null>();
	let nodesSynced = 0;
	let entitiesSynced = 0;
	let teamMembersSynced = 0;

	try {
		const previousSync = await getLatestSyncTimestamp();
		const syncCutoff = previousSync
			? Math.floor(previousSync.getTime() / 1000)
			: null;

		try {
			await updateIntercomSyncRuntime("teams", "Syncing teams");
			let hasMoreTeams = true;
			let teamCursor: string | undefined;

			while (hasMoreTeams) {
				const teamsResponse = await client.listTeams({
					per_page: 50,
					starting_after: teamCursor,
				});
				const teams = teamsResponse.teams || teamsResponse.data || [];

				for (const team of teams) {
					teamNamesById.set(team.id, team.name);
				}

				teamCursor = getNextCursor(teamsResponse.pages?.next);
				hasMoreTeams = Boolean(teamCursor);
			}
		} catch (error) {
			errors.push(`Teams sync failed: ${error}`);
		}

		try {
			await updateIntercomSyncRuntime("team-members", "Syncing team members");
			let hasMoreAdmins = true;
			let adminCursor: string | undefined;

			while (hasMoreAdmins) {
				const adminsResponse = await client.listAdmins({
					per_page: 50,
					starting_after: adminCursor,
				});
				const admins = adminsResponse.admins || adminsResponse.data || [];

				for (const admin of admins) {
					await upsertTeamMember(admin, teamNamesById);
					teamMembersSynced++;
				}

				adminCursor = getNextCursor(adminsResponse.pages?.next);
				hasMoreAdmins = Boolean(adminCursor);
			}
		} catch (error) {
			errors.push(`Team members sync failed: ${error}`);
		}

		try {
			await updateIntercomSyncRuntime(
				"team-member-avatars",
				"Syncing teammate avatars",
			);
			await hydrateIntercomTeamMemberAvatars(client);
		} catch (error) {
			errors.push(`Team member avatar sync failed: ${error}`);
		}

		try {
			await updateIntercomSyncRuntime(
				"assignees",
				"Backfilling assignee links",
			);
			await backfillIntercomAssigneeLinks();
		} catch (error) {
			errors.push(`Assignee backfill failed: ${error}`);
		}

		if (!previousSync) {
			try {
				await updateIntercomSyncRuntime("contacts", "Syncing contacts");
				entitiesSynced += await syncContacts(client);
			} catch (error) {
				errors.push(String(error));
			}
		}

		const conversationIds = new Set<string>();

		let hasMoreConversations = true;
		let conversationCursor: string | undefined;
		while (hasMoreConversations) {
			try {
				await updateIntercomSyncRuntime(
					"conversations",
					previousSync
						? "Syncing changed conversations"
						: "Syncing conversations",
				);
				const response = previousSync
					? await client.searchConversations(
							[
								{
									field: "updated_at",
									operator: ">",
									value: syncCutoff ?? 0,
								},
							],
							{
								per_page: 50,
								starting_after: conversationCursor,
							},
						)
					: await client.listConversations({
							per_page: 50,
							starting_after: conversationCursor,
						});
				const conversations = response.conversations || response.data || [];

				for (const conversation of conversations) {
					conversationIds.add(conversation.id);

					const contactId = conversation.contacts?.contacts?.[0]?.id;
					if (contactId) {
						entitiesSynced += await ensureContactEntity(
							client,
							contactId,
							entityIdCache,
						);
					}

					await upsertConversationNode(conversation);
					nodesSynced++;
				}

				conversationCursor = getNextCursor(response.pages?.next);
				hasMoreConversations = Boolean(conversationCursor);
				await sleep(100);
			} catch (error) {
				errors.push(`Conversations sync failed: ${error}`);
				hasMoreConversations = false;
			}
		}

		let hasMoreTickets = true;
		let ticketCursor: string | undefined;
		while (hasMoreTickets) {
			try {
				await updateIntercomSyncRuntime(
					"tickets",
					previousSync ? "Syncing changed tickets" : "Syncing tickets",
				);
				const response = previousSync
					? await client.searchTickets(
							[
								{
									field: "updated_at",
									operator: ">",
									value: syncCutoff ?? 0,
								},
							],
							{
								per_page: 50,
								starting_after: ticketCursor,
							},
						)
					: await client.listTickets({
							per_page: 50,
							starting_after: ticketCursor,
						});
				const tickets = response.tickets || response.data || [];

				for (const ticket of tickets) {
					if (conversationIds.has(ticket.id)) {
						continue;
					}

					const contactId = ticket.contacts?.contacts?.[0]?.id;
					if (contactId) {
						entitiesSynced += await ensureContactEntity(
							client,
							contactId,
							entityIdCache,
						);
					}

					await upsertTicketNode(ticket);
					nodesSynced++;
				}

				ticketCursor = getNextCursor(response.pages?.next);
				hasMoreTickets = Boolean(ticketCursor);
				await sleep(100);
			} catch (error) {
				if (isIntercomApiError(error) && error.status === 404) {
					await updateIntercomSyncRuntime(
						"tickets",
						"Tickets endpoint unavailable for this workspace. Skipping ticket sync.",
					);
					console.warn(
						"[intercom-sync] Tickets endpoint returned 404. Skipping tickets for this sync run.",
					);
					hasMoreTickets = false;
					continue;
				}

				errors.push(`Tickets sync failed: ${error}`);
				hasMoreTickets = false;
			}
		}

		await updateIntercomSyncRuntime("finalizing", "Finalizing sync");
		await updateSyncState(
			nodesSynced,
			entitiesSynced,
			teamMembersSynced,
			errors,
		);

		return {
			success: errors.length === 0,
			nodesSynced,
			entitiesSynced,
			teamMembersSynced,
			errors,
		};
	} catch (error) {
		const syncError = `Sync failed: ${error}`;
		const allErrors = [...errors, syncError];
		await updateSyncState(
			nodesSynced,
			entitiesSynced,
			teamMembersSynced,
			allErrors,
		);

		return {
			success: false,
			nodesSynced,
			entitiesSynced,
			teamMembersSynced,
			errors: allErrors,
		};
	} finally {
		await finishIntercomSyncRuntime();
	}
}

function skippedSyncResult(): SyncResult {
	return {
		success: false,
		skipped: true,
		nodesSynced: 0,
		entitiesSynced: 0,
		teamMembersSynced: 0,
		errors: ["Sync already running."],
	};
}

export async function syncIntercom(accessToken: string): Promise<SyncResult> {
	const claimed = await claimIntercomSyncRuntime();
	if (!claimed) {
		return skippedSyncResult();
	}

	return runIntercomSync(accessToken);
}

export async function startIntercomSyncInBackground(accessToken: string) {
	const claimed = await claimIntercomSyncRuntime();
	if (!claimed) {
		return false;
	}

	void runIntercomSync(accessToken)
		.then(async (result) => {
			if (!result.success) return;
			try {
				await refreshWallboardContent();
			} catch (error) {
				console.error(
					"[intercom-sync] Post-sync wallboard refresh failed",
					error,
				);
			}
		})
		.catch((error) => {
			console.error("[intercom-sync] Background sync failed", error);
		});

	return true;
}

export async function refreshWallboardContent(input?: {
	logPrefix?: string;
}) {
	const logPrefix = input?.logPrefix ?? "[intercom-sync]";
	const [
		{ filterSupportCasesByProduct, getAvailableProducts, loadSupportCases },
		{ buildLiveWallboardData },
		ticker,
		focusPlan,
		insights,
		npsThemesModule,
		npsCommentTranslationsModule,
		{ readIntercomTickerLlmSettings },
		{ shouldReuseWallboardLlmResult },
	] = await Promise.all([
		import("@/lib/support-health/server"),
		import("@/lib/support-health/logic"),
		import("@/lib/wallboard-ticker-messages"),
		import("@/lib/wallboard-focus-plan"),
		import("@/lib/wallboard-insights"),
		import("@/lib/wallboard-nps-themes"),
		import("@/lib/wallboard-nps-comment-translations"),
		import("@/lib/intercom-admin"),
		import("@/lib/wallboard-llm-cache"),
	]);

	const { cases, lastSyncAt, now, npsRecords, wallboardProducts } =
		await loadSupportCases();
	const selectedProducts = wallboardProducts.filter((product) =>
		getAvailableProducts(cases).includes(product),
	);
	const scopedCases = filterSupportCasesByProduct(cases, selectedProducts, {
		includeUnknownWhenAll: true,
	});
	const live = buildLiveWallboardData(scopedCases, lastSyncAt, now);
	const llmSettings = await readIntercomTickerLlmSettings();

	// Focus plan
	const deterministicFocusPlan =
		focusPlan.buildDeterministicLiveFocusPlan(live);
	const focusPlanInputHash = focusPlan.buildLiveFocusPlanInputHash(
		deterministicFocusPlan,
		live,
	);
	const storedFocusPlan = await focusPlan.readLiveWallboardFocusPlan({
		availableProducts: live.mappedQueues.map((queue) => queue.teamName),
		lookupCases: live.lookupCases,
	});

	if (
		shouldReuseWallboardLlmResult({
			provider: llmSettings.provider,
			enabled: llmSettings.enabled,
			model: llmSettings.model,
			inputHash: focusPlanInputHash,
			stored: storedFocusPlan,
		})
	) {
		console.info(`${logPrefix} Reusing stored AI focus plan.`);
	} else {
		let resolvedFocusPlan = {
			...deterministicFocusPlan,
			inputHash: null,
		};
		try {
			const rewritten = await focusPlan.rewriteLiveFocusPlanWithLlm(
				deterministicFocusPlan,
				live,
				llmSettings,
			);
			if (rewritten?.plan) {
				resolvedFocusPlan = {
					...rewritten.plan,
					inputHash: focusPlanInputHash,
				};
			}
		} catch (error) {
			console.error(
				`${logPrefix} AI focus-plan rewrite failed. Using deterministic plan.`,
				error,
			);
		}
		await focusPlan.writeLiveWallboardFocusPlan(resolvedFocusPlan);
		console.info(
			`${logPrefix} Wallboard focus plan refreshed (${resolvedFocusPlan.source}).`,
		);
	}

	// Product insights
	const productNames = live.mappedQueues.map((q) => q.teamName);
	if (productNames.length > 0) {
		const deterministicInsights = insights.buildDeterministicInsights(
			scopedCases,
			productNames,
		);
		const insightsInputHash = insights.buildInsightsInputHash(
			deterministicInsights,
			scopedCases,
			productNames,
		);
		const storedInsights = await insights.readWallboardInsights();

		if (
			shouldReuseWallboardLlmResult({
				provider: llmSettings.provider,
				enabled: llmSettings.enabled,
				model: llmSettings.model,
				inputHash: insightsInputHash,
				stored: storedInsights,
			})
		) {
			console.info(`${logPrefix} Reusing stored AI wallboard insights.`);
		} else {
			let resolvedInsights = {
				...deterministicInsights,
				inputHash: null,
			};
			try {
				const rewritten = await insights.rewriteInsightsWithLlm(
					deterministicInsights,
					scopedCases,
					productNames,
					llmSettings,
				);
				if (rewritten) {
					resolvedInsights = {
						...rewritten,
						inputHash: insightsInputHash,
					};
				}
			} catch (error) {
				console.error(
					`${logPrefix} AI insights rewrite failed. Using deterministic.`,
					error,
				);
			}
			await insights.writeWallboardInsights(resolvedInsights);
			console.info(
				`${logPrefix} Wallboard insights refreshed (${resolvedInsights.source}).`,
			);
		}
	}

	// NPS themes from customer comments
	if (npsRecords.length > 0) {
		const deterministicNpsThemes =
			npsThemesModule.buildDeterministicNpsThemes(npsRecords);
		const npsThemesInputHash = npsThemesModule.buildNpsThemesInputHash(
			deterministicNpsThemes,
			npsRecords,
		);
		const storedNpsThemes = await npsThemesModule.readWallboardNpsThemes();

		if (
			shouldReuseWallboardLlmResult({
				provider: llmSettings.provider,
				enabled: llmSettings.enabled,
				model: llmSettings.model,
				inputHash: npsThemesInputHash,
				stored: storedNpsThemes,
			})
		) {
			console.info(`${logPrefix} Reusing stored AI NPS themes.`);
		} else {
			let resolvedNpsThemes = {
				...deterministicNpsThemes,
				inputHash: null,
			};
			try {
				const rewritten = await npsThemesModule.rewriteNpsThemesWithLlm(
					deterministicNpsThemes,
					npsRecords,
					llmSettings,
				);
				if (rewritten) {
					resolvedNpsThemes = {
						...rewritten,
						inputHash: npsThemesInputHash,
					};
				}
			} catch (error) {
				console.error(
					`${logPrefix} AI NPS themes rewrite failed. Using deterministic.`,
					error,
				);
			}
			await npsThemesModule.writeWallboardNpsThemes(resolvedNpsThemes);
			console.info(
				`${logPrefix} Wallboard NPS themes refreshed (${resolvedNpsThemes.source}).`,
			);
		}

		const npsCommentTranslationsInputHash =
			npsCommentTranslationsModule.buildNpsCommentTranslationsInputHash(
				npsRecords,
			);
		const storedTranslations =
			await npsCommentTranslationsModule.readWallboardNpsCommentTranslations();

		if (
			shouldReuseWallboardLlmResult({
				provider: llmSettings.provider,
				enabled: llmSettings.enabled,
				model: llmSettings.model,
				inputHash: npsCommentTranslationsInputHash,
				stored: storedTranslations,
			})
		) {
			console.info(`${logPrefix} Reusing stored AI NPS comment translations.`);
		} else {
			try {
				const translatedComments =
					await npsCommentTranslationsModule.rewriteNpsCommentTranslationsWithLlm(
						npsRecords,
						llmSettings,
					);
				if (translatedComments) {
					await npsCommentTranslationsModule.writeWallboardNpsCommentTranslations(
						{
							...translatedComments,
							inputHash: npsCommentTranslationsInputHash,
						},
					);
					console.info(
						`${logPrefix} Wallboard NPS comment translations refreshed (${translatedComments.source}).`,
					);
				}
			} catch (error) {
				console.error(
					`${logPrefix} AI NPS comment translations failed. Keeping stored translations.`,
					error,
				);
			}
		}
	}

	// Ticker messages
	if (live.peopleMoments.length > 0) {
		const tickerInputHash = ticker.buildTickerMessagesInputHash(
			live.peopleMoments,
		);
		const storedTicker = await ticker.readStoredWallboardTickerMessages();

		if (
			shouldReuseWallboardLlmResult({
				provider: llmSettings.provider,
				enabled: llmSettings.enabled,
				model: llmSettings.model,
				inputHash: tickerInputHash,
				stored: storedTicker,
			})
		) {
			console.info(`${logPrefix} Reusing stored AI ticker messages.`);
		} else {
			let items = live.peopleMoments;
			let source: "deterministic" | "ollama" | "codex" = "deterministic";
			let model: string | null = null;
			try {
				const rewritten = await ticker.rewriteTickerMessagesWithLlm(
					live.peopleMoments,
					llmSettings,
				);
				if (rewritten?.items.length) {
					items = rewritten.items;
					source = rewritten.source;
					model = rewritten.model;
				}
			} catch (error) {
				console.error(
					`${logPrefix} AI ticker rewrite failed. Using deterministic messages.`,
					error,
				);
			}
			await ticker.writeWallboardTickerMessages({
				items,
				source,
				model,
				inputHash: source === "deterministic" ? null : tickerInputHash,
			});
			console.info(`${logPrefix} Wallboard ticker refreshed (${source}).`);
		}
	} else {
		console.info(`${logPrefix} No people moments available for ticker refresh.`);
	}

	console.info(`${logPrefix} Post-sync wallboard content refreshed.`);
}

function getNextCursor(
	next:
		| string
		| {
				starting_after?: string;
				page?: number;
		  }
		| undefined,
) {
	if (typeof next === "string") return next;
	return next?.starting_after;
}

async function getLatestSyncTimestamp() {
	const existing = await db
		.select()
		.from(syncState)
		.where(eq(syncState.adapterId, "intercom"))
		.limit(1);

	return existing[0]?.lastSyncAt ?? null;
}

async function syncContacts(client: ReturnType<typeof createIntercomClient>) {
	let entitiesSynced = 0;
	let hasMoreContacts = true;
	let contactCursor: string | undefined;
	let page = 1;

	while (hasMoreContacts) {
		try {
			await updateIntercomSyncRuntime(
				"contacts",
				`Syncing contacts (page ${page}, ${entitiesSynced} synced)`,
			);
			const response = await client.listContacts({
				per_page: 50,
				starting_after: contactCursor,
			});
			const contacts = response.data || [];

			for (const contact of contacts) {
				await upsertEntity(contact);
				entitiesSynced++;
			}

			contactCursor = getNextCursor(response.pages?.next);
			hasMoreContacts = Boolean(contactCursor);
			page++;
			await sleep(100);
		} catch (error) {
			throw new Error(`Contacts sync failed: ${error}`);
		}
	}

	return entitiesSynced;
}

async function ensureContactEntity(
	client: ReturnType<typeof createIntercomClient>,
	contactId: string,
	entityIdCache: Map<string, string | null>,
) {
	if (entityIdCache.has(contactId)) {
		return 0;
	}

	const existing = await resolveEntityId(contactId);
	if (existing) {
		entityIdCache.set(contactId, existing);
		return 0;
	}

	try {
		const contact = await client.getContact(contactId);
		await upsertEntity(contact);
		const entityId = await resolveEntityId(contactId);
		entityIdCache.set(contactId, entityId);
		return 1;
	} catch {
		entityIdCache.set(contactId, null);
		return 0;
	}
}

async function upsertTeamMember(
	admin: IntercomAdmin,
	teamNamesById: Map<string, string>,
) {
	const existing = await db
		.select()
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.externalId, admin.id),
				eq(teamMembers.source, "intercom"),
			),
		)
		.limit(1);

	const teamName =
		admin.team_ids
			?.map((teamId) => teamNamesById.get(teamId))
			.filter((name): name is string => Boolean(name))
			.join(", ") || null;

	const data = {
		externalId: admin.id,
		source: "intercom" as const,
		name: admin.name,
		email: admin.email,
		teamName,
		avatarUrl: getAdminAvatarUrl(admin),
		isAvailable: admin.away_mode_enabled !== true,
		updatedAt: new Date(),
	};

	if (existing.length > 0) {
		await db
			.update(teamMembers)
			.set(data)
			.where(
				and(
					eq(teamMembers.externalId, admin.id),
					eq(teamMembers.source, "intercom"),
				),
			);
	} else {
		await db.insert(teamMembers).values({
			...data,
			createdAt: new Date(),
		});
	}
}

async function upsertEntity(contact: IntercomContact) {
	const existing = await db
		.select()
		.from(entities)
		.where(
			and(eq(entities.externalId, contact.id), eq(entities.source, "intercom")),
		)
		.limit(1);

	const plan = contact.custom_attributes?.plan as string | undefined;
	const mrr = contact.custom_attributes?.mrr as number | undefined;

	const data = {
		externalId: contact.id,
		source: "intercom" as const,
		type: "person" as const,
		email: contact.email || null,
		name: contact.name || null,
		value: {
			plan: plan || null,
			tier: normalizeTier(plan),
			mrr: mrr || null,
			company: contact.companies?.companies?.[0]?.name || null,
		},
		rawData: contact as unknown as Record<string, unknown>,
		updatedAt: new Date(),
	};

	if (existing.length > 0) {
		await db
			.update(entities)
			.set(data)
			.where(
				and(
					eq(entities.externalId, contact.id),
					eq(entities.source, "intercom"),
				),
			);
	} else {
		await db.insert(entities).values({
			...data,
			createdAt: new Date(),
		});
	}
}

function normalizeTier(plan?: string | null) {
	if (!plan) return "unknown";
	const normalized = plan.toLowerCase();
	if (
		normalized === "free" ||
		normalized === "starter" ||
		normalized === "pro" ||
		normalized === "enterprise"
	) {
		return normalized;
	}
	return "unknown";
}

function getAdminAvatarUrl(admin: IntercomAdmin) {
	const candidateValues = [
		typeof admin.avatar === "string" ? admin.avatar : admin.avatar?.image_url,
		admin.avatar_url,
		admin.profile_image_url,
	];

	for (const value of candidateValues) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}

	return null;
}

function toExternalId(value: unknown) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	return null;
}

async function resolveEntityId(contactId?: string) {
	const normalizedContactId = toExternalId(contactId);
	if (!normalizedContactId) return null;

	const entity = await db
		.select()
		.from(entities)
		.where(
			and(
				eq(entities.externalId, normalizedContactId),
				eq(entities.source, "intercom"),
			),
		)
		.limit(1);

	return entity[0]?.id ?? null;
}

async function resolveAssigneeId(adminId?: string | number | null) {
	const normalizedAdminId = toExternalId(adminId);
	if (!normalizedAdminId) return null;

	const assignee = await db
		.select()
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.externalId, normalizedAdminId),
				eq(teamMembers.source, "intercom"),
			),
		)
		.limit(1);

	return assignee[0]?.id ?? null;
}

function mapConversationStatus(state: IntercomConversation["state"]) {
	if (state === "snoozed") return "pending" as const;
	if (state === "closed") return "closed" as const;
	return "open" as const;
}

function mapTicketStatus(ticket: IntercomTicket) {
	if (ticket.open === false) return "closed" as const;

	const stateValue =
		typeof ticket.ticket_state === "string"
			? ticket.ticket_state
			: ticket.ticket_state?.state || ticket.ticket_state?.name;

	const normalized = stateValue?.toLowerCase() || "";
	if (normalized.includes("resolved")) return "resolved" as const;
	if (normalized.includes("closed")) return "closed" as const;
	if (normalized.includes("customer")) return "pending" as const;
	return "open" as const;
}

async function upsertConversationNode(conversation: IntercomConversation) {
	const existing = await db
		.select()
		.from(nodes)
		.where(
			and(eq(nodes.externalId, conversation.id), eq(nodes.source, "intercom")),
		)
		.limit(1);

	const entityId = await resolveEntityId(
		conversation.contacts?.contacts?.[0]?.id,
	);
	const assigneeId = await resolveAssigneeId(
		conversation.assignee?.id ?? conversation.admin_assignee_id,
	);
	const responseTimeSeconds =
		conversation.statistics?.time_to_admin_reply ??
		conversation.statistics?.time_to_first_reply;
	const resolutionSeconds =
		conversation.statistics?.time_to_first_close ??
		conversation.statistics?.time_to_last_close;
	const cx = extractIntercomCx(
		conversation as unknown as Record<string, unknown>,
	);

	// Pick a stable `resolvedAt` for closed conversations.
	//
	// Intercom's `updated_at` bumps on EVERY sync touch (re-tagging, bot edits,
	// raw-data refresh, etc.), so using it directly makes `resolvedAt` drift
	// forward over time — e.g. a conversation closed in December 2025 gets
	// stamped with March 2026 after a resync, polluting period-based metrics.
	// Instead:
	//   1. If we already recorded a `resolvedAt` while the row was closed, keep
	//      it. That value reflects the first observed close — the truest
	//      approximation of when the conversation actually closed.
	//   2. Otherwise derive a close time from `created_at + time_to_last_close`
	//      (Intercom's canonical close duration), which is immutable.
	//   3. Only fall back to `updated_at` if neither is available.
	// On open→closed transitions or brand-new closed rows, this still records
	// a close time; the previous bumping behaviour is what we're eliminating.
	const isClosed = mapConversationStatus(conversation.state) === "closed";
	const previousRow = existing[0];
	const previouslyClosed =
		previousRow &&
		mapConversationStatus(previousRow.status ?? "open") === "closed";
	let resolvedAt: Date | null = null;
	if (isClosed) {
		if (previouslyClosed && previousRow?.resolvedAt) {
			resolvedAt = previousRow.resolvedAt;
		} else if (
			typeof conversation.created_at === "number" &&
			typeof conversation.statistics?.time_to_last_close === "number"
		) {
			resolvedAt = new Date(
				(conversation.created_at + conversation.statistics.time_to_last_close) *
					1000,
			);
		} else {
			resolvedAt = new Date(conversation.updated_at * 1000);
		}
	}

	const data = {
		externalId: conversation.id,
		source: "intercom" as const,
		title: conversation.source?.subject || "Conversation",
		description: conversation.source?.body?.slice(0, 500) || null,
		type: "conversation",
		status: mapConversationStatus(conversation.state),
		priority:
			conversation.priority === "priority"
				? ("high" as const)
				: ("normal" as const),
		tags: conversation.tags?.tags?.map((tag) => tag.name) || [],
		entityId,
		assigneeId,
		valueSignals: {
			team: conversation.team?.name || null,
			tier: null,
			slaStatus: conversation.sla_applied?.sla_status || null,
		},
		effortSignals: {
			waitingSince: conversation.waiting_since || null,
		},
		responseTimeMinutes: responseTimeSeconds
			? Math.floor(responseTimeSeconds / 60)
			: null,
		resolutionTimeHours: resolutionSeconds
			? Number((resolutionSeconds / 3600).toFixed(2))
			: null,
		cxScore: cx.score,
		cxComment: cx.comment,
		rawData: conversation as unknown as Record<string, unknown>,
		resolvedAt,
		updatedAt: new Date(conversation.updated_at * 1000),
	};

	if (existing.length > 0) {
		await db
			.update(nodes)
			.set(data)
			.where(
				and(
					eq(nodes.externalId, conversation.id),
					eq(nodes.source, "intercom"),
				),
			);
	} else {
		await db.insert(nodes).values({
			...data,
			createdAt: new Date(conversation.created_at * 1000),
		});
	}
}

async function upsertTicketNode(ticket: IntercomTicket) {
	const existing = await db
		.select()
		.from(nodes)
		.where(and(eq(nodes.externalId, ticket.id), eq(nodes.source, "intercom")))
		.limit(1);

	const entityId = await resolveEntityId(ticket.contacts?.contacts?.[0]?.id);
	const assigneeId = await resolveAssigneeId(ticket.admin_assignee_id);
	const ticketAttributes =
		(ticket.ticket_attributes as Record<string, unknown> | undefined) || {};

	const title =
		typeof ticketAttributes.subject === "string"
			? ticketAttributes.subject
			: typeof ticketAttributes.title === "string"
				? ticketAttributes.title
				: `Ticket ${ticket.ticket_id || ticket.id}`;
	const description =
		typeof ticketAttributes.description === "string"
			? ticketAttributes.description.slice(0, 500)
			: null;

	// Same stability logic as conversations — keep the first observed
	// resolvedAt rather than letting `updated_at` bumps drift it forward on
	// each sync. See `upsertConversationNode` for the rationale.
	const ticketStatus = mapTicketStatus(ticket);
	const ticketPreviouslyResolved =
		existing[0] &&
		(existing[0].status === "resolved" || existing[0].status === "closed");
	const ticketIsResolved =
		ticketStatus === "resolved" || ticketStatus === "closed";
	const resolvedAt: Date | null = ticketIsResolved
		? ticketPreviouslyResolved && existing[0]?.resolvedAt
			? existing[0].resolvedAt
			: new Date(ticket.updated_at * 1000)
		: null;

	const data = {
		externalId: ticket.id,
		source: "intercom" as const,
		title,
		description,
		type: "ticket",
		status: ticketStatus,
		priority: "normal" as const,
		tags: ticket.tags?.tags?.map((tag) => tag.name) || [],
		entityId,
		assigneeId,
		valueSignals: {
			teamAssigneeId: ticket.team_assignee_id || null,
			ticketType: ticket.ticket_type?.name || null,
		},
		effortSignals: {},
		rawData: ticket as unknown as Record<string, unknown>,
		resolvedAt,
		updatedAt: new Date(ticket.updated_at * 1000),
	};

	if (existing.length > 0) {
		await db
			.update(nodes)
			.set(data)
			.where(
				and(eq(nodes.externalId, ticket.id), eq(nodes.source, "intercom")),
			);
	} else {
		await db.insert(nodes).values({
			...data,
			createdAt: new Date(ticket.created_at * 1000),
		});
	}
}

async function updateSyncState(
	nodesSynced: number,
	entitiesSynced: number,
	teamMembersSynced: number,
	errors: string[],
) {
	const existing = await db
		.select()
		.from(syncState)
		.where(eq(syncState.adapterId, "intercom"))
		.limit(1);

	const data = {
		lastSyncAt: new Date(),
		nodesSynced,
		entitiesSynced,
		teamMembersSynced,
		lastError: errors.length > 0 ? errors.join(" | ") : null,
		lastErrorAt: errors.length > 0 ? new Date() : null,
		updatedAt: new Date(),
	};

	if (existing.length > 0) {
		await db
			.update(syncState)
			.set(data)
			.where(eq(syncState.adapterId, "intercom"));
	} else {
		await db.insert(syncState).values({
			adapterId: "intercom",
			...data,
		});
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAssigneeExternalIdFromRawData(rawData: unknown) {
	if (!isRecord(rawData)) return null;

	const assignee = rawData.assignee;
	if (isRecord(assignee)) {
		const assigneeId = toExternalId(assignee.id);
		if (assigneeId) return assigneeId;
	}

	const adminAssigneeId = toExternalId(rawData.admin_assignee_id);
	if (adminAssigneeId) return adminAssigneeId;

	return null;
}

async function backfillIntercomAssigneeLinks() {
	const candidates = await db
		.select({
			id: nodes.id,
			rawData: nodes.rawData,
		})
		.from(nodes)
		.where(and(eq(nodes.source, "intercom"), isNull(nodes.assigneeId)));

	if (candidates.length === 0) return 0;

	const assigneeExternalIds = Array.from(
		new Set(
			candidates
				.map((item) => getAssigneeExternalIdFromRawData(item.rawData))
				.filter((value): value is string => Boolean(value)),
		),
	);

	if (assigneeExternalIds.length === 0) return 0;

	const assignees = await db
		.select({
			id: teamMembers.id,
			externalId: teamMembers.externalId,
		})
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.source, "intercom"),
				inArray(teamMembers.externalId, assigneeExternalIds),
			),
		);

	const assigneeIdByExternalId = new Map(
		assignees.map((item) => [item.externalId, item.id]),
	);
	let updatedCount = 0;

	for (const candidate of candidates) {
		const externalId = getAssigneeExternalIdFromRawData(candidate.rawData);
		if (!externalId) continue;

		const assigneeId = assigneeIdByExternalId.get(externalId);
		if (!assigneeId) continue;

		await db
			.update(nodes)
			.set({ assigneeId, updatedAt: new Date() })
			.where(eq(nodes.id, candidate.id));
		updatedCount++;
	}

	return updatedCount;
}

async function hydrateIntercomTeamMemberAvatars(
	client: ReturnType<typeof createIntercomClient>,
) {
	const membersMissingAvatar = await db
		.select({
			id: teamMembers.id,
			externalId: teamMembers.externalId,
			avatarUrl: teamMembers.avatarUrl,
		})
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.source, "intercom"),
				or(
					isNull(teamMembers.avatarUrl),
					notLike(teamMembers.avatarUrl, "data:%"),
				),
			),
		)
		.limit(100);

	for (const member of membersMissingAvatar) {
		try {
			const admin = await client.getAdmin(member.externalId);
			const avatarUrl = getAdminAvatarUrl(admin);
			if (!avatarUrl) continue;

			const displayAvatarUrl = await fetchAvatarDataUrl(avatarUrl).catch(
				() => null,
			);
			const nextAvatarUrl = displayAvatarUrl ?? avatarUrl;
			if (nextAvatarUrl === member.avatarUrl) continue;

			await db
				.update(teamMembers)
				.set({ avatarUrl: nextAvatarUrl, updatedAt: new Date() })
				.where(eq(teamMembers.id, member.id));
		} catch {
			// Ignore missing or inaccessible admins. Avatar fallback still renders initials.
		}
	}
}

async function fetchAvatarDataUrl(avatarUrl: string) {
	const response = await fetch(avatarUrl, {
		headers: {
			Accept: "image/*",
		},
	});

	if (!response.ok) return null;

	const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.startsWith("image/")) return null;

	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.length === 0) return null;

	return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export async function getSyncStatus() {
	const state = await db
		.select()
		.from(syncState)
		.where(eq(syncState.adapterId, "intercom"))
		.limit(1);

	if (state.length === 0) {
		return {
			connected: false,
			lastSyncAt: null,
			nodesSynced: 0,
			entitiesSynced: 0,
			teamMembersSynced: 0,
		};
	}

	return {
		connected: true,
		lastSyncAt: state[0].lastSyncAt,
		nodesSynced: state[0].nodesSynced,
		entitiesSynced: state[0].entitiesSynced,
		teamMembersSynced: state[0].teamMembersSynced,
		lastError: state[0].lastError,
	};
}
