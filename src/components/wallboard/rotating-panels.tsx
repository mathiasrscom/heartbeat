import { useEffect, useMemo, useState } from "react";
import { panelSurfaceClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface RotatingPanel {
	id: string;
	label: string;
	content: React.ReactNode;
}

export function RotatingPanels({
	panels,
	intervalMs = 18_000,
	initialIndex = 0,
	showIndicators = true,
	className,
}: {
	panels: RotatingPanel[];
	intervalMs?: number;
	initialIndex?: number;
	showIndicators?: boolean;
	className?: string;
}) {
	const safePanels = useMemo(
		() => panels.filter((panel) => panel.content),
		[panels],
	);
	const [index, setIndex] = useState(
		safePanels.length === 0 ? 0 : Math.min(initialIndex, safePanels.length - 1),
	);
	const [paused, setPaused] = useState(false);

	useEffect(() => {
		if (safePanels.length === 0) return;
		setIndex((current) => current % safePanels.length);
	}, [safePanels.length]);

	useEffect(() => {
		if (paused || safePanels.length < 2) return;

		const timer = window.setInterval(() => {
			setIndex((current) => (current + 1) % safePanels.length);
		}, intervalMs);

		return () => window.clearInterval(timer);
	}, [intervalMs, paused, safePanels.length]);

	if (safePanels.length === 0) return null;

	const active = safePanels[index];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Hover is used only to pause rotation.
		<div
			className={cn("relative flex h-full min-h-0 flex-col", className)}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
		>
			{showIndicators && safePanels.length > 1 ? (
				<div
					className={cn(
						panelSurfaceClassName,
						"absolute right-3 top-3 z-10 flex items-center gap-1.5 bg-background/95 px-2 py-1 backdrop-blur-sm",
					)}
				>
					<div className="flex items-center gap-1.5">
						{safePanels.map((panel, panelIndex) => (
							<button
								key={panel.id}
								type="button"
								aria-label={`Show ${panel.label}`}
								className={cn(
									"h-1.5 rounded-full transition-colors",
									panelIndex === index
										? "w-5 bg-foreground"
										: "w-3 bg-muted-foreground/30 hover:bg-muted-foreground/55",
								)}
								onClick={() => setIndex(panelIndex)}
							/>
						))}
					</div>
					<div className="text-[10px] text-muted-foreground">
						{index + 1}/{safePanels.length}
					</div>
				</div>
			) : null}

			<div
				key={active.id}
				className="h-full min-h-0 flex-1 animate-in overflow-hidden pr-1 fade-in duration-500"
			>
				{active.content}
			</div>
		</div>
	);
}
