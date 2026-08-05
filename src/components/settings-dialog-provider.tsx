import { useServerFn } from "@tanstack/react-start";
import {
	createContext,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import {
	getIntercomConnectionState,
	type IntercomConnectionState,
} from "@/lib/intercom-admin";

const SettingsDialogContent = lazy(() =>
	import("@/routes/settings").then((module) => ({
		default: module.SettingsDialogContent,
	})),
);

const SettingsDialogContext = createContext<{
	openSettings: () => void;
} | null>(null);

export function SettingsDialogProvider({ children }: { children: ReactNode }) {
	const loadSettings = useServerFn(getIntercomConnectionState);
	const [isOpen, setIsOpen] = useState(false);
	const [initialState, setInitialState] =
		useState<IntercomConnectionState | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const closeSettings = useCallback(() => setIsOpen(false), []);
	const openSettings = useCallback(() => {
		setIsOpen(true);
		setInitialState(null);
		setLoadError(null);
		void loadSettings()
			.then(setInitialState)
			.catch((error) => {
				setLoadError(
					error instanceof Error ? error.message : "Unable to load settings.",
				);
			});
	}, [loadSettings]);

	useEffect(() => {
		if (!isOpen) return;

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeSettings();
		};
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [closeSettings, isOpen]);

	return (
		<SettingsDialogContext.Provider value={{ openSettings }}>
			{children}
			{isOpen ? (
				<Suspense fallback={<SettingsDialogLoading onClose={closeSettings} />}>
					{initialState ? (
						<SettingsDialogContent
							initialState={initialState}
							onClose={closeSettings}
						/>
					) : (
						<SettingsDialogLoading onClose={closeSettings} error={loadError} />
					)}
				</Suspense>
			) : null}
		</SettingsDialogContext.Provider>
	);
}

export function useSettingsDialog() {
	const context = useContext(SettingsDialogContext);
	if (!context) {
		throw new Error(
			"useSettingsDialog must be used inside SettingsDialogProvider",
		);
	}
	return context;
}

function SettingsDialogLoading({
	onClose,
	error,
}: {
	onClose: () => void;
	error?: string | null;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: The backdrop is a conventional pointer-only dismiss target; Escape and the close button provide keyboard dismissal.
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Settings"
				className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="text-sm font-medium">
					{error ?? "Loading settings…"}
				</div>
				{error ? (
					<button
						type="button"
						className="mt-4 text-sm text-muted-foreground underline"
						onClick={onClose}
					>
						Close
					</button>
				) : null}
			</div>
		</div>
	);
}
