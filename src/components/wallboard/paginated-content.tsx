import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { panelSurfaceClassName } from "@/components/ui/card";

/**
 * Clips its children to the available container height and auto-rotates
 * through "pages", snapping at row boundaries so items are never cut in half.
 *
 * The outer element must receive a definite height from its parent
 * (e.g. via `h-full` inside a flex/grid ancestor).
 */
export function PaginatedContent({
	children,
	intervalMs = 10_000,
	className,
}: {
	children: React.ReactNode;
	intervalMs?: number;
	className?: string;
}) {
	const outerRef = useRef<HTMLDivElement>(null);
	const innerRef = useRef<HTMLDivElement>(null);
	const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
	const [page, setPage] = useState(0);
	const [paused, setPaused] = useState(false);

	const recalc = useCallback(() => {
		const outer = outerRef.current;
		const inner = innerRef.current;
		if (!outer || !inner) return;

		const viewH = outer.clientHeight;
		const totalH = inner.scrollHeight;

		if (viewH <= 0 || totalH <= viewH) {
			setPageOffsets([0]);
			return;
		}

		// Collect the bottom-edge of every visual row across child grid sections.
		// For grid containers we inspect their items; for plain elements we use
		// the element itself.
		const rowMap = new Map<number, number>(); // absTop → max absBottom

		for (const section of Array.from(inner.children) as HTMLElement[]) {
			const sTop = section.offsetTop;

			if (section.children.length === 0) {
				const bottom = sTop + section.offsetHeight;
				const prev = rowMap.get(sTop);
				if (prev === undefined || bottom > prev) rowMap.set(sTop, bottom);
				continue;
			}

			for (const item of Array.from(section.children) as HTMLElement[]) {
				const absTop = sTop + item.offsetTop;
				const absBottom = absTop + item.offsetHeight;
				const prev = rowMap.get(absTop);
				if (prev === undefined || absBottom > prev)
					rowMap.set(absTop, absBottom);
			}
		}

		const rows = Array.from(rowMap.entries())
			.map(([top, bottom]) => ({ top, bottom }))
			.sort((a, b) => a.top - b.top);

		// Greedily assign rows to pages.
		const offsets: number[] = [0];
		let pageStart = 0;

		for (const row of rows) {
			if (row.bottom - pageStart > viewH && row.top > pageStart) {
				offsets.push(row.top);
				pageStart = row.top;
			}
		}

		setPageOffsets(offsets);
	}, []);

	// Observe size changes on both the viewport and the content.
	useEffect(() => {
		const outer = outerRef.current;
		const inner = innerRef.current;
		if (!outer || !inner) return;

		const observer = new ResizeObserver(recalc);
		observer.observe(outer);
		observer.observe(inner);
		return () => observer.disconnect();
	}, [recalc]);

	// Keep page index in bounds when page count changes.
	useEffect(() => {
		setPage((p) => Math.min(p, Math.max(0, pageOffsets.length - 1)));
	}, [pageOffsets.length]);

	// Auto-rotate through pages.
	useEffect(() => {
		if (paused || pageOffsets.length <= 1) return;
		const timer = window.setInterval(() => {
			setPage((p) => (p + 1) % pageOffsets.length);
		}, intervalMs);
		return () => window.clearInterval(timer);
	}, [paused, pageOffsets.length, intervalMs]);

	const offset = pageOffsets[page] ?? 0;

	return (
		<div
			ref={outerRef}
			className={cn("relative h-full min-h-0 overflow-hidden", className)}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
		>
			<div
				ref={innerRef}
				className="transition-transform duration-500 ease-in-out"
				style={{ transform: `translateY(-${offset}px)` }}
			>
				{children}
			</div>

			{pageOffsets.length > 1 && (
				<div
					className={cn(
						panelSurfaceClassName,
						"absolute bottom-2 right-2 z-10 bg-background/95 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm",
					)}
				>
					{page + 1}/{pageOffsets.length}
				</div>
			)}
		</div>
	);
}
