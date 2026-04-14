import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { panelSurfaceClassName } from "@/components/ui/card";
import { SectionPageIndicatorMountContext } from "@/components/wallboard/wallboard-shell";
import { cn } from "@/lib/utils";

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
	const sectionMountRef = useContext(SectionPageIndicatorMountContext);
	const [sectionMountNode, setSectionMountNode] = useState<HTMLDivElement | null>(
		null,
	);
	const recalcLockRef = useRef(false);

	// Track the section-header mount element so the portal re-renders if the
	// mount is created after this component first mounts (e.g. initial paint).
	useEffect(() => {
		if (!sectionMountRef) {
			setSectionMountNode(null);
			return;
		}
		setSectionMountNode(sectionMountRef.current);
	}, [sectionMountRef]);

	const recalc = useCallback(() => {
		// Guard against feedback loops: applying spacers mutates child margins
		// which changes inner.scrollHeight, which fires ResizeObserver, which
		// would re-enter recalc. Skip nested calls.
		if (recalcLockRef.current) return;
		const outer = outerRef.current;
		const inner = innerRef.current;
		if (!outer || !inner) return;

		const viewH = outer.clientHeight;

		if (viewH <= 0) {
			setPageOffsets([0]);
			return;
		}

		recalcLockRef.current = true;

		// Clear any previously-applied spacer styles before measuring so the
		// layout reflects natural content flow.
		const allDescendants = inner.querySelectorAll<HTMLElement>(
			"[data-paginated-spacer]",
		);
		for (const el of allDescendants) {
			el.style.marginTop = "";
			el.removeAttribute("data-paginated-spacer");
		}

		// Measure after spacer removal.
		const totalH = inner.scrollHeight;
		if (totalH <= viewH) {
			setPageOffsets([0]);
			// Release the lock on the next animation frame so observer callbacks
			// triggered by our spacer-clear mutation are suppressed first.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					recalcLockRef.current = false;
				});
			});
			return;
		}

		// Use getBoundingClientRect so positioning is robust regardless of
		// whether ancestor elements are positioned. All offsets are measured
		// relative to `inner`'s top edge.
		let innerRect = inner.getBoundingClientRect();
		const topOf = (el: HTMLElement) =>
			el.getBoundingClientRect().top - innerRect.top;
		const bottomOf = (el: HTMLElement) => {
			const rect = el.getBoundingClientRect();
			return rect.top + rect.height - innerRect.top;
		};

		// For each direct child of `inner`, decide whether its children are
		// real visual rows (grid / flex containers) or whether the child itself
		// is a single atomic row. Rows within the same row group keep track
		// of the first DOM element in that row so we can apply spacers there.
		interface Row {
			top: number;
			bottom: number;
			element: HTMLElement;
		}

		const rowMap = new Map<number, Row>();

		for (const section of Array.from(inner.children) as HTMLElement[]) {
			const display = window.getComputedStyle(section).display;
			const treatAsRowGroup =
				(display.includes("grid") || display.includes("flex")) &&
				section.children.length > 0;

			if (treatAsRowGroup) {
				for (const item of Array.from(section.children) as HTMLElement[]) {
					const top = Math.round(topOf(item));
					const bottom = bottomOf(item);
					const prev = rowMap.get(top);
					if (prev === undefined) {
						rowMap.set(top, { top, bottom, element: item });
					} else if (bottom > prev.bottom) {
						rowMap.set(top, { ...prev, bottom });
					}
				}
			} else {
				const top = Math.round(topOf(section));
				const bottom = bottomOf(section);
				const prev = rowMap.get(top);
				if (prev === undefined) {
					rowMap.set(top, { top, bottom, element: section });
				} else if (bottom > prev.bottom) {
					rowMap.set(top, { ...prev, bottom });
				}
			}
		}

		const rows = Array.from(rowMap.values()).sort((a, b) => a.top - b.top);

		// Walk rows. When a row doesn't fit in the current page, push it down
		// via margin-top so its new top aligns with the next page boundary.
		const offsets: number[] = [0];
		let pageStart = 0;
		let pushDown = 0; // cumulative margin added by earlier spacers

		for (const row of rows) {
			const currentTop = row.top + pushDown;
			const currentBottom = row.bottom + pushDown;

			if (currentBottom - pageStart > viewH && currentTop > pageStart) {
				const nextPageStart = pageStart + viewH;
				const gap = nextPageStart - currentTop;
				if (gap > 0) {
					// Preserve any existing margin (e.g. `mt-4` utility) by adding
					// to computed marginTop rather than overwriting.
					const computedMT = parseFloat(
						window.getComputedStyle(row.element).marginTop || "0",
					);
					row.element.style.marginTop = `${computedMT + gap}px`;
					row.element.setAttribute("data-paginated-spacer", "1");
					pushDown += gap;
				}
				offsets.push(nextPageStart);
				pageStart = nextPageStart;
			}
		}

		// Force a re-read of innerRect in case future measurement calls
		// compare against stale values.
		innerRect = inner.getBoundingClientRect();

		setPageOffsets(offsets);

		// Release the lock after two animation frames so observer callbacks
		// triggered by our mutations (clear + apply) are suppressed.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				recalcLockRef.current = false;
			});
		});
	}, []);

	// Observe size changes on both the viewport and the content.
	useEffect(() => {
		const outer = outerRef.current;
		const inner = innerRef.current;
		if (!outer || !inner) return;

		const observer = new ResizeObserver(recalc);
		observer.observe(outer);
		observer.observe(inner);

		// Some browsers don't reliably fire ResizeObserver for browser zoom
		// changes — listen to window resize as a backstop. Also recalc once
		// after fonts/images settle.
		const handleResize = () => recalc();
		window.addEventListener("resize", handleResize);
		const settleTimer = window.setTimeout(recalc, 200);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", handleResize);
			window.clearTimeout(settleTimer);
		};
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

	const pageIndicator =
		pageOffsets.length > 1 ? (
			<div
				className="flex items-center gap-1"
				aria-label={`Page ${page + 1} of ${pageOffsets.length}`}
			>
				{pageOffsets.map((_, i) => (
					<span
						key={i}
						className={cn(
							"h-1.5 rounded-full transition-colors",
							i === page
								? "w-5 bg-foreground"
								: "w-3 bg-muted-foreground/30",
						)}
					/>
				))}
			</div>
		) : null;

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

			{pageIndicator && sectionMountNode
				? createPortal(pageIndicator, sectionMountNode)
				: pageIndicator ? (
					<div
						className={cn(
							panelSurfaceClassName,
							"absolute bottom-2 right-2 z-10 bg-background/95 px-2 py-0.5 backdrop-blur-sm",
						)}
					>
						{pageIndicator}
					</div>
				) : null}
		</div>
	);
}
