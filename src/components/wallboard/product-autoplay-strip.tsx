import { useEffect, useMemo, useState } from "react";
import { panelSurfaceClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ProductAutoplayState {
	products: string[];
	activeIndex: number;
	activeProduct: string | null;
	setActiveIndex: (index: number) => void;
}

function uniqueProducts(products: string[]) {
	return Array.from(
		new Set(
			products.map((value) => value.trim()).filter((value) => value.length > 0),
		),
	);
}

export function useProductAutoplay(
	products: string[],
	options?: {
		intervalMs?: number;
	},
): ProductAutoplayState {
	const stableProducts = useMemo(() => uniqueProducts(products), [products]);
	const stableProductKey = stableProducts.join("|");
	const intervalMs = options?.intervalMs ?? 12_000;
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		setActiveIndex(() => {
			void stableProductKey;
			return 0;
		});
	}, [stableProductKey]);

	useEffect(() => {
		if (stableProducts.length < 2) return;

		const timer = window.setInterval(() => {
			setActiveIndex((current) => (current + 1) % stableProducts.length);
		}, intervalMs);

		return () => window.clearInterval(timer);
	}, [intervalMs, stableProducts.length]);

	return {
		products: stableProducts,
		activeIndex:
			stableProducts.length === 0 ? 0 : activeIndex % stableProducts.length,
		activeProduct:
			stableProducts.length === 0
				? null
				: stableProducts[activeIndex % stableProducts.length],
		setActiveIndex,
	};
}

export function ProductAutoplayStrip({
	title,
	subtitle,
	state,
	mode = "full",
	className,
}: {
	title: string;
	subtitle: string;
	state: ProductAutoplayState;
	mode?: "full" | "compact";
	className?: string;
}) {
	const { products, activeIndex, activeProduct, setActiveIndex } = state;

	if (mode === "compact") {
		return (
			<div className={cn(panelSurfaceClassName, "px-4 py-2.5", className)}>
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0 truncate text-sm">
						<span className="text-muted-foreground">{title}: </span>
						<span className="font-semibold text-foreground">
							{activeProduct ?? "All products"}
						</span>
					</div>
					<div className="shrink-0 text-xs text-muted-foreground">
						{products.length > 1
							? `${activeIndex + 1}/${products.length} • 12s`
							: "Single"}
					</div>
				</div>
				{products.length > 1 ? (
					<div className="mt-2 flex items-center gap-1.5">
						{products.map((product, index) => {
							const active = index === activeIndex;
							return (
								<button
									key={product}
									type="button"
									aria-label={`Focus ${product}`}
									onClick={() => setActiveIndex(index)}
									className={cn(
										"h-1.5 rounded-full transition-colors",
										active
											? "w-7 bg-foreground"
											: "w-4 bg-muted-foreground/30 hover:bg-muted-foreground/55",
									)}
								/>
							);
						})}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div className={cn(panelSurfaceClassName, "px-5 py-4", className)}>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<div className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
						{title}
					</div>
					<div className="mt-2 text-xl font-semibold tracking-tight text-foreground">
						{activeProduct ?? "No product selected"}
					</div>
					<div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
				</div>
				<div className="text-right text-sm text-muted-foreground">
					{products.length > 1 ? (
						<>
							<div>
								Product {activeIndex + 1}/{products.length}
							</div>
							<div>Auto-rotates every 12s</div>
						</>
					) : (
						<div>Single product focus</div>
					)}
				</div>
			</div>
			{products.length > 0 ? (
				<div className="mt-4 flex flex-wrap gap-2">
					{products.map((product, index) => {
						const active = index === activeIndex;
						return (
							<button
								key={product}
								type="button"
								onClick={() => setActiveIndex(index)}
								className={cn(
									"rounded-lg border px-3 py-1.5 text-sm transition-colors",
									active
										? "border-border bg-card text-foreground"
										: "border-border/40 bg-background text-muted-foreground hover:border-border hover:text-foreground",
								)}
							>
								{product}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
