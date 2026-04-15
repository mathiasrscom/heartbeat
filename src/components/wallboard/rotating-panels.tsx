import { useEffect, useMemo, useState } from "react";
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
	className,
}: {
	panels: RotatingPanel[];
	intervalMs?: number;
	initialIndex?: number;
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
		if (paused || safePanels.length < 2) return;

		const timer = window.setInterval(() => {
			setIndex((current) => (current + 1) % safePanels.length);
		}, intervalMs);

		return () => window.clearInterval(timer);
	}, [intervalMs, paused, safePanels.length]);

	if (safePanels.length === 0) return null;

	const safeIndex = index % safePanels.length;
	const active = safePanels[safeIndex];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Hover is used only to pause rotation.
		<div
			className={cn("relative flex h-full min-h-0 flex-col", className)}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
		>
			<div
				key={active.id}
				className="h-full min-h-0 flex-1 overflow-hidden"
			>
				{active.content}
			</div>
		</div>
	);
}
