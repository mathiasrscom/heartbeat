import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	CheckCircle2,
	Clock3,
	LoaderCircle,
	Plug,
	RefreshCcw,
	ShieldAlert,
	XCircle,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	getIntercomConnectionState,
	type IntercomConnectionState,
	listIntercomTickerOllamaModels,
	removeIntercomConnection,
	saveIntercomConnection,
	saveIntercomSupportTargets,
	saveIntercomTickerLlmSettings,
	saveIntercomWorkspaceLink,
	triggerIntercomSync,
} from "@/lib/intercom-admin";
import type { SupportPerformanceTargets } from "@/lib/support-health/targets";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
	head: () => ({
		meta: [
			{
				title: "Heartbeat - Settings",
			},
		],
	}),
	loader: async () => getIntercomConnectionState(),
	component: SettingsPage,
});

function SettingsPage() {
	const initialState = Route.useLoaderData();
	const refreshIntercomState = useServerFn(getIntercomConnectionState);
	const connectIntercom = useServerFn(saveIntercomConnection);
	const saveWorkspaceLink = useServerFn(saveIntercomWorkspaceLink);
	const saveSupportTargets = useServerFn(saveIntercomSupportTargets);
	const saveTickerLlmSettings = useServerFn(saveIntercomTickerLlmSettings);
	const listTickerModels = useServerFn(listIntercomTickerOllamaModels);
	const removeIntercom = useServerFn(removeIntercomConnection);
	const syncIntercom = useServerFn(triggerIntercomSync);

	const [state, setState] = useState(initialState);
	const [accessToken, setAccessToken] = useState("");
	const [appUrl, setAppUrl] = useState(initialState.appUrl ?? "");
	const [tickerLlmModel, setTickerLlmModel] = useState(
		initialState.tickerLlmModel ?? "",
	);
	const [tickerLlmBaseUrl, setTickerLlmBaseUrl] = useState(
		initialState.tickerLlmBaseUrl ?? "",
	);
	const [supportTargets, setSupportTargets] = useState(
		initialState.supportTargets,
	);
	const [availableTickerModels, setAvailableTickerModels] = useState<string[]>(
		[],
	);
	const [isCustomTickerModelMode, setIsCustomTickerModelMode] = useState(false);
	const [isLoadingTickerModels, setIsLoadingTickerModels] = useState(false);
	const [tickerModelsError, setTickerModelsError] = useState<string | null>(
		null,
	);
	const [resolvedTickerBaseUrl, setResolvedTickerBaseUrl] = useState<
		string | null
	>(initialState.tickerLlmBaseUrl ?? null);
	const [feedback, setFeedback] = useState<{
		tone: "success" | "error";
		text: string;
	} | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isSavingAppUrl, setIsSavingAppUrl] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);
	const [isStartingSync, setIsStartingSync] = useState(false);
	const [isSavingSupportTargets, setIsSavingSupportTargets] = useState(false);
	const [isSavingTickerLlm, setIsSavingTickerLlm] = useState(false);
	const tickerLookupRequestRef = useRef(0);
	const supportTargetFieldId = useId();

	const canSaveTickerLlm =
		tickerLlmBaseUrl.trim().length > 0 && tickerLlmModel.trim().length > 0;

	useEffect(() => {
		if (!state.isSyncRunning) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void refreshIntercomState().then((nextState) => {
				setState(nextState);
				setSupportTargets(nextState.supportTargets);
			});
		}, 2000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [refreshIntercomState, state.isSyncRunning]);

	useEffect(() => {
		const rawBaseUrl = tickerLlmBaseUrl.trim();

		if (!rawBaseUrl) {
			tickerLookupRequestRef.current += 1;
			setIsLoadingTickerModels(false);
			setTickerModelsError(null);
			setAvailableTickerModels([]);
			setResolvedTickerBaseUrl(null);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			const requestId = ++tickerLookupRequestRef.current;
			setIsLoadingTickerModels(true);
			setTickerModelsError(null);

			void listTickerModels({ data: { baseUrl: rawBaseUrl } })
				.then((result) => {
					if (tickerLookupRequestRef.current !== requestId) return;

					setResolvedTickerBaseUrl(result.baseUrl);
					setAvailableTickerModels(result.models);
					setTickerLlmModel((current) => {
						const trimmed = current.trim();
						if (isCustomTickerModelMode) return current;
						if (result.models.length === 0) return current;
						if (!trimmed || !result.models.includes(trimmed)) {
							return result.models[0];
						}
						return current;
					});
				})
				.catch((error) => {
					if (tickerLookupRequestRef.current !== requestId) return;
					const message =
						error instanceof Error
							? error.message
							: "Unable to read models from Ollama.";
					setAvailableTickerModels([]);
					setTickerModelsError(message);
					setResolvedTickerBaseUrl(null);
				})
				.finally(() => {
					if (tickerLookupRequestRef.current === requestId) {
						setIsLoadingTickerModels(false);
					}
				});
		}, 500);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isCustomTickerModelMode, listTickerModels, tickerLlmBaseUrl]);

	async function handleConnect(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setIsSaving(true);

		try {
			const result = await connectIntercom({
				data: {
					accessToken,
				},
			});

			setState(result.state);
			setAccessToken("");
			setAppUrl(result.state.appUrl ?? "");
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to connect to Intercom.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSaving(false);
		}
	}

	async function handleSaveWorkspaceLink(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setIsSavingAppUrl(true);

		try {
			const result = await saveWorkspaceLink({
				data: {
					appUrl,
				},
			});
			setState(result.state);
			setAppUrl(result.state.appUrl ?? "");
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to save the Intercom workspace link.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSavingAppUrl(false);
		}
	}

	async function handleSaveTickerLlm(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setIsSavingTickerLlm(true);

		try {
			const result = await saveTickerLlmSettings({
				data: {
					model: tickerLlmModel,
					baseUrl: tickerLlmBaseUrl,
				},
			});

			setState(result.state);
			setTickerLlmModel(result.state.tickerLlmModel ?? "");
			setTickerLlmBaseUrl(result.state.tickerLlmBaseUrl ?? "");
			setResolvedTickerBaseUrl(result.state.tickerLlmBaseUrl ?? null);
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to save ticker generation settings.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSavingTickerLlm(false);
		}
	}

	async function handleClearTickerLlm() {
		setFeedback(null);
		setIsSavingTickerLlm(true);

		try {
			const result = await saveTickerLlmSettings({
				data: {
					model: "",
					baseUrl: "",
				},
			});
			setState(result.state);
			setTickerLlmModel("");
			setTickerLlmBaseUrl("");
			setIsCustomTickerModelMode(false);
			setAvailableTickerModels([]);
			setTickerModelsError(null);
			setResolvedTickerBaseUrl(null);
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to clear ticker generation settings.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSavingTickerLlm(false);
		}
	}

	async function handleSync() {
		setFeedback(null);
		setIsStartingSync(true);

		try {
			const result = await syncIntercom();
			setState(result.state);
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unable to run Intercom sync.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsStartingSync(false);
		}
	}

	async function handleRemoveToken() {
		setFeedback(null);
		setIsRemoving(true);

		try {
			const result = await removeIntercom();
			setState(result.state);
			setAccessToken("");
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to remove the stored Intercom token.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsRemoving(false);
		}
	}

	const tokenPlaceholder = state.hasStoredToken
		? "Paste a new token to replace the stored one"
		: state.tokenSource === "environment"
			? "Store a database fallback token"
			: "Access token";
	const saveLabel = state.hasStoredToken
		? "Replace and verify"
		: "Save and verify";
	const syncButtonLabel = state.isSyncRunning
		? state.syncStageLabel || "Syncing"
		: "Sync now";

	function updateDefaultSupportTarget(
		field: keyof SupportPerformanceTargets,
		value: string,
	) {
		setSupportTargets((current) => ({
			...current,
			defaultTargets: {
				...current.defaultTargets,
				[field]: normalizeTargetInputValue(
					value,
					current.defaultTargets[field],
				),
			},
		}));
	}

	function updateProductSupportTarget(
		productName: string,
		field: keyof SupportPerformanceTargets,
		value: string,
	) {
		setSupportTargets((current) => {
			const currentTargets =
				current.productTargets[productName] ?? current.defaultTargets;

			return {
				...current,
				productTargets: {
					...current.productTargets,
					[productName]: {
						...currentTargets,
						[field]: normalizeTargetInputValue(value, currentTargets[field]),
					},
				},
			};
		});
	}

	async function handleSaveSupportTargets(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setIsSavingSupportTargets(true);

		try {
			const productTargets = Object.fromEntries(
				state.supportTargetProducts
					.map((productName) => {
						const targets =
							supportTargets.productTargets[productName] ??
							supportTargets.defaultTargets;

						return [productName, targets] as const;
					})
					.filter(
						([, targets]) =>
							targets.slaTargetPercent !==
								supportTargets.defaultTargets.slaTargetPercent ||
							targets.satisfactionTargetPercent !==
								supportTargets.defaultTargets.satisfactionTargetPercent,
					),
			);

			const result = await saveSupportTargets({
				data: {
					supportTargets: {
						defaultTargets: supportTargets.defaultTargets,
						productTargets,
					},
				},
			});

			setState(result.state);
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to save support targets.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSavingSupportTargets(false);
		}
	}

	return (
		<div className="p-4 lg:p-6 max-w-3xl">
			<div className="mb-4">
				<h1 className="text-xl font-semibold">Settings</h1>
				<p className="text-xs text-muted-foreground">
					Configure the Intercom connection and wallboard defaults
				</p>
			</div>

			<div className="space-y-3">
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center gap-2 mb-2">
							<div className="p-1.5 rounded-md bg-sky-500/10">
								<Plug className="h-3.5 w-3.5 text-blue-600" />
							</div>
							<div className="flex-1">
								<span className="text-xs font-medium">Intercom</span>
								<span className="text-[10px] text-muted-foreground ml-2">
									Conversations, tickets, SLA, and CX data
								</span>
							</div>
							<StatusBadge state={state} />
						</div>

						<div className="grid gap-2 sm:grid-cols-3 text-xs mb-3">
							<StatCard
								label="Last sync"
								value={formatTimestamp(state.lastSyncAt, "Never")}
							/>
							<StatCard
								label="Connection"
								value={
									state.verifiedAdminEmail ||
									state.tokenHint ||
									"No token configured"
								}
							/>
							<StatCard
								label="Latest import"
								value={
									state.lastSyncAt
										? `${state.nodesSynced} cases • ${state.entitiesSynced} contacts`
										: "Run first sync"
								}
							/>
						</div>

						{state.isSyncRunning ? (
							<div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
								<div className="flex items-center gap-2 font-medium">
									<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
									{state.syncStageLabel || "Intercom sync is running"}
								</div>
								{state.syncStartedAt ? (
									<div className="mt-1 text-[10px] text-amber-800/80">
										Started {formatTimestamp(state.syncStartedAt, "Unknown")}
									</div>
								) : null}
							</div>
						) : null}

						<div className="mb-3 rounded-lg border bg-muted/20 px-3 py-2">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div className="space-y-1 text-xs">
									<div className="font-medium text-foreground">
										Token storage
									</div>
									<div className="text-muted-foreground">
										{state.hasStoredToken
											? `${state.storedTokenHint} is stored in the database for background sync.`
											: "No Intercom token is stored in the database yet."}
									</div>
									{state.tokenSource === "environment" ? (
										<div className="text-muted-foreground">
											The active sync is using `INTERCOM_ACCESS_TOKEN` from the
											environment.
										</div>
									) : state.hasStoredToken ? (
										<div className="text-muted-foreground">
											The active sync is using the stored database token.
										</div>
									) : null}
								</div>

								{state.hasStoredToken ? (
									<Button
										size="sm"
										type="button"
										variant="outline"
										className="h-8 text-xs px-3"
										onClick={handleRemoveToken}
										disabled={isRemoving}
									>
										{isRemoving ? (
											<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
										) : null}
										Remove stored token
									</Button>
								) : null}
							</div>
						</div>

						<form
							className="flex flex-col gap-2 sm:flex-row"
							onSubmit={handleConnect}
						>
							<Input
								type="password"
								placeholder={tokenPlaceholder}
								className="flex-1 h-7 text-xs"
								value={accessToken}
								onChange={(event) => setAccessToken(event.target.value)}
							/>
							<Button
								size="sm"
								className="h-7 text-xs px-3"
								type="submit"
								disabled={isSaving || accessToken.trim().length === 0}
							>
								{isSaving ? (
									<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
								) : null}
								{saveLabel}
							</Button>
							<Button
								size="sm"
								type="button"
								variant="outline"
								className="h-7 text-xs px-3"
								onClick={handleSync}
								disabled={
									isStartingSync || state.isSyncRunning || !state.hasAccessToken
								}
							>
								{isStartingSync || state.isSyncRunning ? (
									<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
								) : (
									<RefreshCcw className="h-3.5 w-3.5" />
								)}
								{syncButtonLabel}
							</Button>
						</form>
						<p className="text-[10px] text-muted-foreground mt-1">
							Get from Intercom → Settings → Developers → Access Token
						</p>

						<form
							className="mt-3 flex flex-col gap-2 sm:flex-row"
							onSubmit={handleSaveWorkspaceLink}
						>
							<Input
								type="url"
								placeholder="Intercom workspace link"
								className="flex-1 h-7 text-xs"
								value={appUrl}
								onChange={(event) => setAppUrl(event.target.value)}
							/>
							<Button
								size="sm"
								className="h-7 text-xs px-3"
								type="submit"
								disabled={isSavingAppUrl || appUrl.trim().length === 0}
							>
								{isSavingAppUrl ? (
									<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
								) : null}
								Save workspace link
							</Button>
						</form>
						<p className="text-[10px] text-muted-foreground mt-1">
							Example:
							https://app.eu.intercom.com/a/inbox/zah460bv/inbox/conversation/215560824562362
						</p>

						<form
							className="mt-3 rounded-lg border bg-muted/20 px-3 py-3"
							onSubmit={handleSaveTickerLlm}
						>
							<div className="mb-2 flex items-center justify-between gap-3">
								<div>
									<div className="text-xs font-medium text-foreground">
										Ollama settings
									</div>
									<div className="text-[10px] text-muted-foreground">
										Add a base URL and we auto-load local models. Saving enables
										generated wallboard messages.
									</div>
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-2">
								<Input
									type="url"
									placeholder="http://127.0.0.1:11434"
									className="h-7 text-xs"
									value={tickerLlmBaseUrl}
									onChange={(event) => setTickerLlmBaseUrl(event.target.value)}
								/>
								{availableTickerModels.length > 0 &&
								!isCustomTickerModelMode ? (
									<select
										className="h-7 w-full rounded-md border border-input bg-background px-3 text-xs"
										value={tickerLlmModel}
										onChange={(event) => {
											const value = event.target.value;
											if (value === "__custom__") {
												setIsCustomTickerModelMode(true);
												setTickerLlmModel("");
												return;
											}
											setTickerLlmModel(value);
										}}
									>
										{availableTickerModels.map((model) => (
											<option key={model} value={model}>
												{model}
											</option>
										))}
										<option value="__custom__">Custom model…</option>
									</select>
								) : (
									<Input
										type="text"
										placeholder="llama3.1:8b"
										className="h-7 text-xs"
										value={tickerLlmModel}
										onChange={(event) => setTickerLlmModel(event.target.value)}
									/>
								)}
							</div>
							<div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
								<div>
									{isLoadingTickerModels
										? "Querying Ollama models..."
										: tickerModelsError
											? tickerModelsError
											: availableTickerModels.length > 0
												? `${availableTickerModels.length} model${availableTickerModels.length === 1 ? "" : "s"} found at ${
														resolvedTickerBaseUrl ?? tickerLlmBaseUrl
													}`
												: tickerLlmBaseUrl.trim()
													? "No models found at this URL yet."
													: "Fallback mode: deterministic ticker messages"}
								</div>
								{availableTickerModels.length > 0 ? (
									<Button
										size="sm"
										type="button"
										variant="ghost"
										className="h-6 px-2 text-[10px]"
										onClick={() => {
											if (isCustomTickerModelMode) {
												setIsCustomTickerModelMode(false);
												if (availableTickerModels.length > 0) {
													setTickerLlmModel(availableTickerModels[0]);
												}
											} else {
												setIsCustomTickerModelMode(true);
											}
										}}
									>
										{isCustomTickerModelMode
											? "Use discovered models"
											: "Use custom model"}
									</Button>
								) : null}
							</div>
							<div className="mt-2 flex items-center justify-between gap-2">
								<div className="text-[10px] text-muted-foreground">
									{state.tickerLlmEnabled && state.tickerLlmModel
										? `Active: ${state.tickerLlmProvider ?? "ollama"} • ${state.tickerLlmModel}`
										: "Ollama disabled until both URL and model are saved"}
								</div>
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										type="button"
										variant="outline"
										className="h-7 text-xs px-3"
										disabled={
											isSavingTickerLlm ||
											(!state.tickerLlmEnabled &&
												!tickerLlmBaseUrl &&
												!tickerLlmModel)
										}
										onClick={handleClearTickerLlm}
									>
										Clear settings
									</Button>
									<Button
										size="sm"
										className="h-7 text-xs px-3"
										type="submit"
										disabled={isSavingTickerLlm || !canSaveTickerLlm}
									>
										{isSavingTickerLlm ? (
											<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
										) : null}
										Save Ollama settings
									</Button>
								</div>
							</div>
						</form>

						<div className="mt-3 rounded-lg border bg-muted/20 px-3 py-2 text-xs">
							<div className="font-medium text-foreground">CX source</div>
							<div className="mt-1 text-muted-foreground">
								Primary: <code>conversation_rating.rating</code>. Fallbacks:{" "}
								<code>custom_attributes[&quot;CX Score rating&quot;]</code> and{" "}
								<code>ai_agent.rating</code>.
							</div>
							<div className="mt-1 text-muted-foreground">
								CX period metrics use resolved conversations only.
							</div>
							<div className="mt-1 text-muted-foreground">
								Satisfaction score = percent of rated conversations with a 4 or
								5 rating.
							</div>
						</div>

						<form
							className="mt-3 rounded-lg border bg-muted/20 px-3 py-3"
							onSubmit={handleSaveSupportTargets}
						>
							<div className="mb-3">
								<div className="text-xs font-medium text-foreground">
									Support targets
								</div>
								<div className="text-[10px] text-muted-foreground">
									Set the SLA and satisfaction thresholds per product. The
									default target is used when all products are shown together.
								</div>
							</div>

							<div className="space-y-3">
								<div className="rounded-md border bg-background/70 p-3">
									<div className="mb-2 text-[11px] font-medium text-foreground">
										Default target
									</div>
									<div className="grid gap-2 sm:grid-cols-2">
										<TargetNumberField
											id={`${supportTargetFieldId}-default-sla`}
											label="SLA target %"
											value={supportTargets.defaultTargets.slaTargetPercent}
											onChange={(value) =>
												updateDefaultSupportTarget("slaTargetPercent", value)
											}
										/>
										<TargetNumberField
											id={`${supportTargetFieldId}-default-cx`}
											label="CX target %"
											value={
												supportTargets.defaultTargets.satisfactionTargetPercent
											}
											onChange={(value) =>
												updateDefaultSupportTarget(
													"satisfactionTargetPercent",
													value,
												)
											}
										/>
									</div>
								</div>

								<div className="space-y-2">
									{state.supportTargetProducts.map((productName) => {
										const targets =
											supportTargets.productTargets[productName] ??
											supportTargets.defaultTargets;

										return (
											<div
												key={productName}
												className="grid gap-3 rounded-md border bg-background/70 p-3 sm:grid-cols-[minmax(0,1fr)_112px_112px]"
											>
												<div className="min-w-0">
													<div className="truncate text-sm font-medium text-foreground">
														{productName}
													</div>
													<div className="mt-1 text-[10px] text-muted-foreground">
														Used when this product is filtered or spotlighted on
														the wallboards.
													</div>
												</div>
												<TargetNumberField
													id={`support-target-${toTargetId(productName)}-sla`}
													label="SLA target %"
													value={targets.slaTargetPercent}
													onChange={(value) =>
														updateProductSupportTarget(
															productName,
															"slaTargetPercent",
															value,
														)
													}
												/>
												<TargetNumberField
													id={`support-target-${toTargetId(productName)}-cx`}
													label="CX target %"
													value={targets.satisfactionTargetPercent}
													onChange={(value) =>
														updateProductSupportTarget(
															productName,
															"satisfactionTargetPercent",
															value,
														)
													}
												/>
											</div>
										);
									})}
								</div>
							</div>

							<div className="mt-3 flex justify-end">
								<Button
									size="sm"
									className="h-7 px-3 text-xs"
									type="submit"
									disabled={isSavingSupportTargets}
								>
									{isSavingSupportTargets ? (
										<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
									) : null}
									Save support targets
								</Button>
							</div>
						</form>

						{feedback ? (
							<div
								className={cn(
									"mt-3 rounded-lg border px-3 py-2 text-xs",
									feedback.tone === "success"
										? "border-emerald-200 bg-emerald-50 text-emerald-800"
										: "border-red-200 bg-red-50 text-red-800",
								)}
							>
								{feedback.text}
							</div>
						) : null}

						{state.lastError ? (
							<div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
								<div className="flex items-center gap-2 font-medium">
									<ShieldAlert className="h-3.5 w-3.5" />
									Latest sync issue
								</div>
								<div className="mt-1">{state.lastError}</div>
								{state.lastErrorAt ? (
									<div className="mt-1 text-[10px] text-red-700/80">
										{formatTimestamp(state.lastErrorAt, "Unknown")}
									</div>
								) : null}
							</div>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardContent className="p-3">
						<div className="flex items-center gap-2 mb-3">
							<div className="p-1.5 rounded-md bg-amber-500/10">
								<Clock3 className="h-3.5 w-3.5 text-amber-600" />
							</div>
							<span className="text-xs font-medium">Sync cadence</span>
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1">
									Refresh interval
								</div>
								<div className="font-medium">
									Every {state.syncIntervalMinutes} minutes
								</div>
							</div>
							<div className="rounded-md border p-3">
								<div className="text-muted-foreground mb-1">Stale warning</div>
								<div className="font-medium">
									After {state.staleAfterMinutes} minutes
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function normalizeTargetInputValue(value: string, fallback: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(100, Math.max(0, Number(parsed.toFixed(1))));
}

function TargetNumberField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: number;
	onChange: (value: string) => void;
}) {
	return (
		<div className="block">
			<label
				htmlFor={id}
				className="mb-1 block text-[10px] text-muted-foreground"
			>
				{label}
			</label>
			<Input
				id={id}
				type="number"
				min={0}
				max={100}
				step={1}
				className="h-8 text-xs"
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}

function toTargetId(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function StatusBadge({ state }: { state: IntercomConnectionState }) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"text-[10px] px-1.5 py-0 gap-1",
				state.status === "connected" &&
					"border-emerald-200 bg-emerald-50 text-emerald-700",
				state.status === "configured" &&
					"border-amber-200 bg-amber-50 text-amber-700",
				state.status === "error" && "border-red-200 bg-red-50 text-red-700",
			)}
		>
			{state.status === "connected" ? (
				<CheckCircle2 className="h-2.5 w-2.5" />
			) : state.status === "configured" ? (
				<Clock3 className="h-2.5 w-2.5" />
			) : state.status === "error" ? (
				<ShieldAlert className="h-2.5 w-2.5" />
			) : (
				<XCircle className="h-2.5 w-2.5" />
			)}
			{state.statusLabel}
		</Badge>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-muted/20 p-3">
			<div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</div>
			<div className="mt-1 text-sm font-medium leading-snug">{value}</div>
		</div>
	);
}

function formatTimestamp(value: string | null, fallback: string) {
	if (!value) return fallback;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return fallback;

	return date.toLocaleString();
}
