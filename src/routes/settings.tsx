import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	CheckCircle2,
	Clock3,
	Cpu,
	Gauge,
	LoaderCircle,
	Monitor,
	Plug,
	RefreshCcw,
	ShieldAlert,
	SlidersHorizontal,
	Target,
	X,
	XCircle,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	getIntercomConnectionState,
	type IntercomConnectionState,
	listIntercomTickerOllamaModels,
	removeIntercomConnection,
	resetIntercomDataAndSync,
	saveIntercomConnection,
	saveIntercomSupportTargets,
	saveIntercomTickerLlmSettings,
	saveIntercomWorkspaceLink,
	saveWallboardDisplaySettings,
	triggerIntercomSync,
	type WallboardTheme,
} from "@/lib/intercom-admin";
import type { SupportPerformanceTargets } from "@/lib/support-health/targets";
import { cn } from "@/lib/utils";
import { DEFAULT_CODEX_MODEL } from "@/lib/wallboard-llm-config";

type TickerProvider = "ollama" | "codex";

const settingsSectionClassName = "border-t border-border/40 pt-5";
const settingsSubsectionClassName = "border-t border-border/40 pt-4";
const settingsBlockClassName = "py-3";
const settingsRowClassName = "border-t border-border/40 py-3";

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
	const navigate = useNavigate();
	return (
		<SettingsDialogContent
			initialState={initialState}
			onClose={() => void navigate({ to: "/wallboard/attention" })}
		/>
	);
}

export function SettingsDialogContent({
	initialState,
	onClose,
}: {
	initialState: IntercomConnectionState;
	onClose: () => void;
}) {
	const refreshIntercomState = useServerFn(getIntercomConnectionState);
	const connectIntercom = useServerFn(saveIntercomConnection);
	const saveWorkspaceLink = useServerFn(saveIntercomWorkspaceLink);
	const saveSupportTargets = useServerFn(saveIntercomSupportTargets);
	const saveTickerLlmSettings = useServerFn(saveIntercomTickerLlmSettings);
	const listTickerModels = useServerFn(listIntercomTickerOllamaModels);
	const removeIntercom = useServerFn(removeIntercomConnection);
	const syncIntercom = useServerFn(triggerIntercomSync);
	const resetIntercomData = useServerFn(resetIntercomDataAndSync);

	const [state, setState] = useState(initialState);
	const [accessToken, setAccessToken] = useState("");
	const [appUrl, setAppUrl] = useState(initialState.appUrl ?? "");
	const [tickerLlmProvider, setTickerLlmProvider] = useState<TickerProvider>(
		initialState.tickerLlmProvider === "codex" ? "codex" : "ollama",
	);
	const [tickerLlmModel, setTickerLlmModel] = useState(
		initialState.tickerLlmModel ?? "",
	);
	const [tickerLlmBaseUrl, setTickerLlmBaseUrl] = useState(
		initialState.tickerLlmBaseUrl ?? "",
	);
	const [tickerLlmAuthToken, setTickerLlmAuthToken] = useState("");
	const [removeTickerLlmAuthToken, setRemoveTickerLlmAuthToken] =
		useState(false);
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
	const [isResettingIntercomData, setIsResettingIntercomData] = useState(false);
	const [resetConfirmation, setResetConfirmation] = useState("");
	const [isSavingSupportTargets, setIsSavingSupportTargets] = useState(false);
	const [isSavingTickerLlm, setIsSavingTickerLlm] = useState(false);
	const saveWallboardDisplay = useServerFn(saveWallboardDisplaySettings);
	const [wallboardTheme, setWallboardTheme] = useState<WallboardTheme>(
		initialState.wallboardTheme,
	);
	const [wallboardProducts, setWallboardProducts] = useState<string[]>(
		initialState.wallboardProducts,
	);
	const [wallboardTrackedTeammates, setWallboardTrackedTeammates] = useState<
		string[]
	>(initialState.wallboardTrackedTeammates);
	const [isSavingWallboard, setIsSavingWallboard] = useState(false);
	const tickerLookupRequestRef = useRef(0);
	const didInitializeWorkspaceAutosaveRef = useRef(false);
	const didInitializeTickerAutosaveRef = useRef(false);
	const didInitializeTargetsAutosaveRef = useRef(false);
	const didInitializeDisplayAutosaveRef = useRef(false);
	const supportTargetFieldId = useId();
	const dialogTitleId = useId();
	const resetConfirmationId = useId();
	const intercomSectionId = useId();
	const aiSectionId = useId();
	const targetsSectionId = useId();
	const syncSectionId = useId();
	const displaySectionId = useId();
	const settingsNavItems = [
		{ href: `#${intercomSectionId}`, label: "Intercom", icon: Plug },
		{ href: `#${aiSectionId}`, label: "AI provider", icon: Cpu },
		{ href: `#${targetsSectionId}`, label: "Targets", icon: Target },
		{ href: `#${syncSectionId}`, label: "Sync", icon: Gauge },
		{ href: `#${displaySectionId}`, label: "Display", icon: SlidersHorizontal },
	] as const;
	const isOllamaProvider = tickerLlmProvider === "ollama";
	const showTickerModelSelect =
		isOllamaProvider &&
		availableTickerModels.length > 0 &&
		!isCustomTickerModelMode;
	const tickerStatusText =
		state.tickerLlmEnabled && state.tickerLlmProvider === "codex"
			? `Active: Codex CLI • ${state.tickerLlmModel ?? DEFAULT_CODEX_MODEL}`
			: state.tickerLlmEnabled && state.tickerLlmModel
				? `Active: Ollama • ${state.tickerLlmModel}`
				: isOllamaProvider
					? "Ollama stays off until both base URL and model are saved."
					: `Codex CLI uses ${DEFAULT_CODEX_MODEL}.`;
	const hasDraftTickerLlmSettings =
		tickerLlmBaseUrl.trim().length > 0 ||
		tickerLlmModel.trim().length > 0 ||
		tickerLlmProvider === "codex";
	const canSaveTickerLlm = isOllamaProvider
		? tickerLlmModel.trim().length > 0 && tickerLlmBaseUrl.trim().length > 0
		: true;
	const canResetIntercomData =
		state.hasAccessToken &&
		!state.isSyncRunning &&
		resetConfirmation === "RESET INTERCOM";
	const resetIntercomHint = state.isSyncRunning
		? "Sync is running"
		: !state.hasAccessToken
			? "Connect Intercom first"
			: resetConfirmation === "RESET INTERCOM"
				? "Ready to reset"
				: "Type RESET INTERCOM";
	const supportTargetsAutosaveKey = JSON.stringify(supportTargets);
	const displayAutosaveKey = JSON.stringify({
		wallboardTheme,
		wallboardProducts,
		wallboardTrackedTeammates,
	});

	useEffect(() => {
		if (!state.isSyncRunning) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void refreshIntercomState().then((nextState) => {
				setState(nextState);
			});
		}, 2000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [refreshIntercomState, state.isSyncRunning]);

	useEffect(() => {
		if (!isOllamaProvider) {
			tickerLookupRequestRef.current += 1;
			setIsLoadingTickerModels(false);
			setTickerModelsError(null);
			setAvailableTickerModels([]);
			setResolvedTickerBaseUrl(null);
			return;
		}

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

			void listTickerModels({
				data: { baseUrl: rawBaseUrl, authToken: tickerLlmAuthToken },
			})
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
	}, [
		isCustomTickerModelMode,
		isOllamaProvider,
		listTickerModels,
		tickerLlmAuthToken,
		tickerLlmBaseUrl,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: The debounce must restart only when the editable workspace value changes.
	useEffect(() => {
		if (!didInitializeWorkspaceAutosaveRef.current) {
			didInitializeWorkspaceAutosaveRef.current = true;
			return;
		}
		if (!appUrl.trim()) return;

		const timeoutId = window.setTimeout(() => {
			void saveWorkspaceLinkNow();
		}, 700);
		return () => window.clearTimeout(timeoutId);
	}, [appUrl]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: The listed primitive fields are the intended autosave trigger surface.
	useEffect(() => {
		if (!didInitializeTickerAutosaveRef.current) {
			didInitializeTickerAutosaveRef.current = true;
			return;
		}
		if (!canSaveTickerLlm) return;

		const timeoutId = window.setTimeout(() => {
			void saveTickerLlmNow();
		}, 800);
		return () => window.clearTimeout(timeoutId);
	}, [
		canSaveTickerLlm,
		removeTickerLlmAuthToken,
		tickerLlmAuthToken,
		tickerLlmBaseUrl,
		tickerLlmModel,
		tickerLlmProvider,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: The serialized target draft is the intentional autosave key.
	useEffect(() => {
		if (!didInitializeTargetsAutosaveRef.current) {
			didInitializeTargetsAutosaveRef.current = true;
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void saveSupportTargetsNow();
		}, 600);
		return () => window.clearTimeout(timeoutId);
	}, [supportTargetsAutosaveKey]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: The serialized display draft is the intentional autosave key.
	useEffect(() => {
		if (!didInitializeDisplayAutosaveRef.current) {
			didInitializeDisplayAutosaveRef.current = true;
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void handleSaveWallboardDisplay();
		}, 500);
		return () => window.clearTimeout(timeoutId);
	}, [displayAutosaveKey]);

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

	async function saveWorkspaceLinkNow() {
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

	async function saveTickerLlmNow() {
		setFeedback(null);
		setIsSavingTickerLlm(true);

		try {
			const result = await saveTickerLlmSettings({
				data: {
					provider: tickerLlmProvider,
					model: isOllamaProvider ? tickerLlmModel : "",
					baseUrl: tickerLlmBaseUrl,
					authToken: isOllamaProvider ? tickerLlmAuthToken : "",
					removeAuthToken: removeTickerLlmAuthToken,
				},
			});

			setState(result.state);
			setTickerLlmProvider(
				result.state.tickerLlmProvider === "codex" ? "codex" : "ollama",
			);
			setTickerLlmModel(result.state.tickerLlmModel ?? "");
			setTickerLlmBaseUrl(result.state.tickerLlmBaseUrl ?? "");
			setResolvedTickerBaseUrl(result.state.tickerLlmBaseUrl ?? null);
			setTickerLlmAuthToken("");
			setRemoveTickerLlmAuthToken(false);
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
					provider: null,
					model: "",
					baseUrl: "",
					authToken: "",
					removeAuthToken: true,
				},
			});
			setState(result.state);
			setTickerLlmProvider(
				result.state.tickerLlmProvider === "codex" ? "codex" : "ollama",
			);
			setTickerLlmModel("");
			setTickerLlmBaseUrl("");
			setTickerLlmAuthToken("");
			setRemoveTickerLlmAuthToken(false);
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

	async function handleResetIntercomData(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canResetIntercomData || isResettingIntercomData) return;

		setFeedback(null);
		setIsResettingIntercomData(true);

		try {
			const result = await resetIntercomData({
				data: {
					confirmation: resetConfirmation,
				},
			});
			setState(result.state);
			setSupportTargets(result.state.supportTargets);
			setResetConfirmation("");
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to reset Intercom data.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsResettingIntercomData(false);
		}
	}

	const tokenPlaceholder = state.hasStoredToken
		? "Paste a new token to replace the stored one"
		: state.tokenSource === "environment"
			? "Store a database fallback token"
			: "Access token";
	const saveLabel = state.hasStoredToken
		? "Replace and verify"
		: "Connect and verify";
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

	async function saveSupportTargetsNow() {
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

	async function handleSaveWallboardDisplay() {
		setFeedback(null);
		setIsSavingWallboard(true);

		try {
			const result = await saveWallboardDisplay({
				data: {
					theme: wallboardTheme,
					products: wallboardProducts,
					trackedTeammates: wallboardTrackedTeammates,
				},
			});
			setState(result.state);
			setSupportTargets(result.state.supportTargets);
			setFeedback({ tone: "success", text: result.message });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to save wallboard display settings.";
			setFeedback({ tone: "error", text: message });
		} finally {
			setIsSavingWallboard(false);
		}
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: The backdrop is a conventional pointer-only dismiss target; Escape and the close button provide keyboard dismissal.
		<div
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm lg:p-6",
				wallboardTheme === "dark" && "dark",
			)}
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={dialogTitleId}
				className="mx-auto flex h-[calc(100vh-1.5rem)] w-full max-w-7xl overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl shadow-black/10 lg:h-[calc(100vh-3rem)]"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-bg-surface/55 p-4">
					<div className="flex items-center gap-3 px-2 py-2">
						<span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background">
							<img
								src="/product_support_logo.png"
								alt=""
								className="h-6 w-6 rounded object-contain"
							/>
						</span>
						<div>
							<div className="text-sm font-semibold">Heartbeat</div>
							<div className="text-[11px] text-muted-foreground">Settings</div>
						</div>
					</div>
					<nav className="mt-6 space-y-1" aria-label="Settings sections">
						{settingsNavItems.map((item) => (
							<a
								key={item.href}
								href={item.href}
								className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
							>
								<item.icon className="h-4 w-4" />
								{item.label}
							</a>
						))}
					</nav>
					<div className="mt-auto space-y-1 border-t border-border/50 pt-4">
						<Link
							to="/wallboard/attention"
							className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
						>
							<Monitor className="h-4 w-4" /> Attention now
						</Link>
						<Link
							to="/wallboard/pulse"
							className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
						>
							<Gauge className="h-4 w-4" /> Customer pulse
						</Link>
					</div>
				</aside>

				<main className="min-w-0 flex-1 overflow-y-auto scroll-smooth">
					<div className="mx-auto max-w-4xl p-6 lg:p-9">
						<div className="mb-8 flex items-start justify-between gap-4">
							<div>
								<h1
									id={dialogTitleId}
									className="text-2xl font-semibold tracking-tight"
								>
									Settings
								</h1>
								<p className="mt-1 text-sm text-muted-foreground">
									Connections, intelligence, targets, and monitor defaults
								</p>
							</div>
							<button
								type="button"
								aria-label="Close settings"
								onClick={onClose}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<div className="space-y-10">
							<section
								id={intercomSectionId}
								className={settingsSectionClassName}
							>
								<div className="flex items-center gap-2 mb-2">
									<Plug className="h-4 w-4 text-muted-foreground" />
									<div className="flex-1">
										<span className="text-xs font-medium">Intercom</span>
										<span className="text-[10px] text-muted-foreground ml-2">
											Conversations, tickets, SLA, and CX data
										</span>
									</div>
									<StatusBadge state={state} />
								</div>

								<div className="grid gap-2 sm:grid-cols-3 text-xs mb-3">
									<StatItem
										label="Last sync"
										value={formatTimestamp(state.lastSyncAt, "Never")}
									/>
									<StatItem
										label="Connection"
										value={
											state.verifiedAdminEmail ||
											state.tokenHint ||
											"No token configured"
										}
									/>
									<StatItem
										label="Latest import"
										value={
											state.lastSyncAt
												? `${state.nodesSynced} cases • ${state.entitiesSynced} contacts`
												: "Run first sync"
										}
									/>
								</div>

								{state.isSyncRunning ? (
									<div className="mb-4 border-l-2 border-amber-400 py-1 pl-3 text-xs text-amber-900">
										<div className="flex items-center gap-2 font-medium">
											<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
											{state.syncStageLabel || "Intercom sync is running"}
										</div>
										{state.syncStartedAt ? (
											<div className="mt-1 text-[10px] text-amber-800/80">
												Started{" "}
												{formatTimestamp(state.syncStartedAt, "Unknown")}
											</div>
										) : null}
									</div>
								) : null}

								<div className={cn("mb-4", settingsBlockClassName)}>
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
													The active sync is using `INTERCOM_ACCESS_TOKEN` from
													the environment.
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
									<input
										type="text"
										name="intercom-token-context"
										value="intercom"
										autoComplete="username"
										className="sr-only"
										tabIndex={-1}
										readOnly
										aria-hidden="true"
									/>
									<Input
										type="password"
										name="intercom-access-token"
										autoComplete="new-password"
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
											isStartingSync ||
											state.isSyncRunning ||
											!state.hasAccessToken
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
									className="mt-4 border-t border-red-200/70 pt-3"
									onSubmit={handleResetIntercomData}
								>
									<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(230px,280px)]">
										<div className="flex gap-3">
											<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
											<div className="min-w-0 space-y-1 text-xs">
												<div className="text-sm font-medium text-foreground">
													Reset Intercom sync data
												</div>
												<p className="text-muted-foreground">
													Deletes synced cases, contacts, teammates, sync state,
													and generated wallboard caches.
												</p>
												<p className="text-muted-foreground">
													Keeps token, workspace link, targets, Nova, and
													display settings. A full sync starts immediately after
													reset.
												</p>
											</div>
										</div>
										<div className="space-y-2">
											<label
												htmlFor={resetConfirmationId}
												className="block text-xs font-medium text-foreground"
											>
												Confirm reset
											</label>
											<Input
												id={resetConfirmationId}
												value={resetConfirmation}
												onChange={(event) =>
													setResetConfirmation(event.target.value)
												}
												placeholder="Type RESET INTERCOM"
												autoComplete="off"
												spellCheck={false}
												className="h-8 bg-background font-mono text-xs"
											/>
											<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
												<div
													className={cn(
														"text-[11px]",
														canResetIntercomData
															? "text-red-700"
															: "text-muted-foreground",
													)}
												>
													{resetIntercomHint}
												</div>
												<Button
													size="sm"
													type="submit"
													variant={
														canResetIntercomData ? "destructive" : "outline"
													}
													className="h-8 px-3 text-xs sm:w-32"
													disabled={
														isResettingIntercomData || !canResetIntercomData
													}
												>
													{isResettingIntercomData ? (
														<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
													) : (
														<RefreshCcw className="h-3.5 w-3.5" />
													)}
													Reset and sync
												</Button>
											</div>
										</div>
									</div>
								</form>

								<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
									<Input
										type="url"
										placeholder="Intercom workspace link"
										className="flex-1 h-7 text-xs"
										value={appUrl}
										onChange={(event) => setAppUrl(event.target.value)}
									/>
									<span className="text-[10px] text-muted-foreground">
										{isSavingAppUrl ? "Saving…" : "Saved automatically"}
									</span>
								</div>
								<p className="text-[10px] text-muted-foreground mt-1">
									Example:
									https://app.eu.intercom.com/a/inbox/zah460bv/inbox/conversation/215560824562362
								</p>

								<div
									id={aiSectionId}
									className={cn("mt-4", settingsSubsectionClassName)}
								>
									<div className="mb-2 flex items-center justify-between gap-3">
										<div>
											<div className="text-xs font-medium text-foreground">
												Nova rewrite settings
											</div>
											<div className="text-[10px] text-muted-foreground">
												Choose whether wallboard copy is rewritten through local
												Ollama HTTP or a direct local `codex` CLI process.
											</div>
										</div>
									</div>

									<div className="grid gap-2 sm:grid-cols-3">
										<select
											className="h-7 w-full rounded-md border border-input bg-background px-3 text-xs"
											value={tickerLlmProvider}
											onChange={(event) => {
												const nextProvider =
													event.target.value === "codex" ? "codex" : "ollama";
												setTickerLlmProvider(nextProvider);
												setFeedback(null);
												setTickerModelsError(null);
												setIsCustomTickerModelMode(false);
												if (nextProvider === "codex") {
													setTickerLlmModel("");
												}
											}}
										>
											<option value="ollama">Ollama</option>
											<option value="codex">Codex CLI</option>
										</select>
										{isOllamaProvider ? (
											<Input
												type="url"
												placeholder="http://127.0.0.1:11434"
												className="h-7 text-xs"
												value={tickerLlmBaseUrl}
												onChange={(event) =>
													setTickerLlmBaseUrl(event.target.value)
												}
											/>
										) : (
											<div className="border-l border-border/40 py-1 pl-3 text-[10px] text-muted-foreground sm:col-span-2">
												Codex CLI runs `codex exec` with {DEFAULT_CODEX_MODEL}.
												There is no model setting here.
											</div>
										)}
										{isOllamaProvider && showTickerModelSelect ? (
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
										) : isOllamaProvider ? (
											<Input
												type="text"
												placeholder="llama3.1:8b"
												className="h-7 text-xs"
												value={tickerLlmModel}
												onChange={(event) =>
													setTickerLlmModel(event.target.value)
												}
											/>
										) : null}
									</div>
									{isOllamaProvider ? (
										<div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
											<Input
												type="password"
												autoComplete="new-password"
												placeholder={
													state.hasTickerLlmAuthToken
														? `Optional auth token · stored ${state.tickerLlmAuthTokenHint}`
														: "Optional bearer/API token"
												}
												className="h-8 text-xs"
												value={tickerLlmAuthToken}
												onChange={(event) => {
													setTickerLlmAuthToken(event.target.value);
													if (event.target.value.trim()) {
														setRemoveTickerLlmAuthToken(false);
													}
												}}
											/>
											{state.hasTickerLlmAuthToken ? (
												<Button
													type="button"
													size="sm"
													variant={
														removeTickerLlmAuthToken ? "destructive" : "outline"
													}
													className="h-8 text-xs"
													onClick={() =>
														setRemoveTickerLlmAuthToken((current) => !current)
													}
												>
													{removeTickerLlmAuthToken
														? "Token will be removed"
														: "Remove token"}
												</Button>
											) : null}
											<p className="text-[10px] text-muted-foreground sm:col-span-2">
												Sent as an Authorization bearer token to authenticated
												Ollama-compatible endpoints. Leave blank to keep the
												stored token.
											</p>
										</div>
									) : null}
									<div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
										<div>
											{isOllamaProvider
												? isLoadingTickerModels
													? "Querying Ollama models..."
													: tickerModelsError
														? tickerModelsError
														: availableTickerModels.length > 0
															? `${availableTickerModels.length} model${
																	availableTickerModels.length === 1 ? "" : "s"
																} found at ${
																	resolvedTickerBaseUrl ?? tickerLlmBaseUrl
																}`
															: tickerLlmBaseUrl.trim()
																? "No Ollama models found at this URL yet."
																: "Fallback mode: deterministic ticker messages"
												: `Codex CLI uses the local binary, ${DEFAULT_CODEX_MODEL}, and your existing \`codex login\` session.`}
										</div>
										{isOllamaProvider && availableTickerModels.length > 0 ? (
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
									{!isOllamaProvider ? (
										<p className="mt-2 text-[10px] text-muted-foreground">
											If you run Heartbeat in Docker, the worker container needs
											the `codex` binary and auth in that same container. A
											host-only `codex login` will not be visible inside the
											container.
										</p>
									) : null}
									<div className="mt-2 flex items-center justify-between gap-2">
										<div className="text-[10px] text-muted-foreground">
											{tickerStatusText}
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
														!hasDraftTickerLlmSettings)
												}
												onClick={handleClearTickerLlm}
											>
												Clear settings
											</Button>
											<span className="text-[10px] text-muted-foreground">
												{isSavingTickerLlm ? "Saving…" : "Saved automatically"}
											</span>
										</div>
									</div>
								</div>

								<div className="mt-4 border-t border-border/40 pt-3 text-xs">
									<div className="font-medium text-foreground">CX source</div>
									<div className="mt-1 text-muted-foreground">
										Primary: <code>conversation_rating.rating</code>. Fallbacks:{" "}
										<code>custom_attributes[&quot;CX Score rating&quot;]</code>{" "}
										and <code>ai_agent.rating</code>.
									</div>
									<div className="mt-1 text-muted-foreground">
										CX period metrics use resolved conversations only.
									</div>
									<div className="mt-1 text-muted-foreground">
										Satisfaction score = percent of rated conversations with a 4
										or 5 rating.
									</div>
								</div>

								<div
									id={targetsSectionId}
									className={cn("mt-4", settingsSubsectionClassName)}
								>
									<div className="mb-3">
										<div className="text-xs font-medium text-foreground">
											Support targets
										</div>
										<div className="text-[10px] text-muted-foreground">
											Set the SLA and satisfaction thresholds per product. The
											default target is used when all products are shown
											together.
										</div>
									</div>

									<div className="space-y-3">
										<div className={settingsBlockClassName}>
											<div className="mb-2 text-[11px] font-medium text-foreground">
												Default target
											</div>
											<div className="grid gap-2 sm:grid-cols-2">
												<TargetNumberField
													id={`${supportTargetFieldId}-default-sla`}
													label="SLA target %"
													value={supportTargets.defaultTargets.slaTargetPercent}
													onChange={(value) =>
														updateDefaultSupportTarget(
															"slaTargetPercent",
															value,
														)
													}
												/>
												<TargetNumberField
													id={`${supportTargetFieldId}-default-cx`}
													label="CX target %"
													value={
														supportTargets.defaultTargets
															.satisfactionTargetPercent
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
														className={cn(
															"grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px_112px]",
															settingsRowClassName,
														)}
													>
														<div className="min-w-0">
															<div className="truncate text-sm font-medium text-foreground">
																{productName}
															</div>
															<div className="mt-1 text-[10px] text-muted-foreground">
																Used when this product is filtered or
																spotlighted on the wallboards.
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

									<div className="mt-3 text-right text-[10px] text-muted-foreground">
										{isSavingSupportTargets ? "Saving…" : "Saved automatically"}
									</div>
								</div>

								{feedback ? (
									<div
										className={cn(
											"mt-4 border-l-2 py-1 pl-3 text-xs",
											feedback.tone === "success"
												? "border-emerald-400 text-emerald-800"
												: "border-red-400 text-red-800",
										)}
									>
										{feedback.text}
									</div>
								) : null}

								{state.lastError ? (
									<div className="mt-4 border-l-2 border-red-400 py-1 pl-3 text-xs text-red-800">
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
							</section>

							<section id={syncSectionId} className={settingsSectionClassName}>
								<div className="flex items-center gap-2 mb-3">
									<Clock3 className="h-4 w-4 text-muted-foreground" />
									<span className="text-xs font-medium">Sync cadence</span>
								</div>
								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className={settingsBlockClassName}>
										<div className="text-muted-foreground mb-1">
											Refresh interval
										</div>
										<div className="font-medium">
											Every {state.syncIntervalMinutes} minutes
										</div>
									</div>
									<div className={settingsBlockClassName}>
										<div className="text-muted-foreground mb-1">
											Stale warning
										</div>
										<div className="font-medium">
											After {state.staleAfterMinutes} minutes
										</div>
									</div>
								</div>
							</section>

							<section
								id={displaySectionId}
								className={cn("space-y-4", settingsSectionClassName)}
							>
								<div className="flex items-center gap-2">
									<Monitor className="h-4 w-4 text-muted-foreground" />
									<div className="flex-1">
										<span className="text-xs font-medium">
											Wallboard display
										</span>
										<span className="text-[10px] text-muted-foreground ml-2">
											Theme for TV monitors
										</span>
									</div>
								</div>

								<div className="py-2">
									<div className="text-xs font-medium text-foreground mb-1">
										Theme
									</div>
									<div className="text-[10px] text-muted-foreground mb-3">
										Choose light or dark mode for wallboard screens.
									</div>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											type="button"
											variant={
												wallboardTheme === "light" ? "default" : "outline"
											}
											className="h-7 text-xs px-3"
											onClick={() => setWallboardTheme("light")}
										>
											Light
										</Button>
										<Button
											size="sm"
											type="button"
											variant={
												wallboardTheme === "dark" ? "default" : "outline"
											}
											className="h-7 text-xs px-3"
											onClick={() => setWallboardTheme("dark")}
										>
											Dark
										</Button>
									</div>
								</div>

								{state.supportTargetProducts.length > 0 ? (
									<div className={settingsSubsectionClassName}>
										<div className="text-xs font-medium text-foreground mb-1">
											Focus products
										</div>
										<div className="text-[10px] text-muted-foreground mb-3">
											Select which products to show on wallboards. Leave empty
											for all products.
										</div>
										<div className="flex flex-wrap gap-2">
											{state.supportTargetProducts.map((product) => {
												const isSelected = wallboardProducts.includes(product);
												return (
													<Button
														key={product}
														size="sm"
														type="button"
														variant={isSelected ? "default" : "outline"}
														className="h-7 text-xs px-3"
														onClick={() => {
															setWallboardProducts((current) =>
																isSelected
																	? current.filter((p) => p !== product)
																	: [...current, product],
															);
														}}
													>
														{product}
													</Button>
												);
											})}
										</div>
									</div>
								) : null}

								{state.availableWallboardTeammates.length > 0 ? (
									<div className={settingsSubsectionClassName}>
										<div className="flex items-center justify-between gap-3 text-xs font-medium text-foreground mb-1">
											<span>Tracked teammates</span>
											<span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-foreground">
												{wallboardTrackedTeammates.length} selected
											</span>
										</div>
										<div className="text-[10px] text-muted-foreground mb-3">
											Select who should appear in the live assignment load view.
										</div>
										<div className="flex flex-wrap gap-2">
											{state.availableWallboardTeammates.map((teammate) => {
												const isSelected = wallboardTrackedTeammates.includes(
													teammate.externalId,
												);
												return (
													<Button
														key={teammate.externalId}
														size="sm"
														type="button"
														aria-pressed={isSelected}
														variant={isSelected ? "default" : "outline"}
														className={cn(
															"h-8 gap-2 px-3 text-xs",
															isSelected && "ring-2 ring-accent-primary ring-offset-2 ring-offset-background",
														)}
														onClick={() => {
															setWallboardTrackedTeammates((current) =>
																isSelected
																	? current.filter(
																			(id) => id !== teammate.externalId,
																		)
																	: [...current, teammate.externalId],
															);
														}}
													>
														{isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
														<span
															className={cn(
																"h-1.5 w-1.5 rounded-full",
																teammate.isAvailable
																	? "bg-emerald-500"
																	: "bg-amber-500",
															)}
														/>
														{teammate.name}
													</Button>
												);
											})}
										</div>
									</div>
								) : null}

								<div className="pt-1 text-right text-[10px] text-muted-foreground">
									{isSavingWallboard ? "Saving…" : "Saved automatically"}
								</div>
							</section>
						</div>
					</div>
				</main>
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
	const [draft, setDraft] = useState(String(value));

	function handleChange(nextValue: string) {
		setDraft(nextValue);
		if (nextValue.trim() === "") return;
		const parsed = Number(nextValue);
		if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
			onChange(nextValue);
		}
	}

	function handleBlur() {
		const parsed = Number(draft);
		const normalized = Number.isFinite(parsed)
			? Math.min(100, Math.max(0, Number(parsed.toFixed(1))))
			: value;
		setDraft(String(normalized));
		onChange(String(normalized));
	}

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
				value={draft}
				onChange={(event) => handleChange(event.target.value)}
				onBlur={handleBlur}
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

function StatItem({ label, value }: { label: string; value: string }) {
	return (
		<div className="py-2">
			<div className="text-[10px] text-muted-foreground">{label}</div>
			<div className="mt-1 text-sm font-medium leading-snug text-foreground">
				{value}
			</div>
		</div>
	);
}

function formatTimestamp(value: string | null, fallback: string) {
	if (!value) return fallback;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return fallback;

	return date.toLocaleString();
}
