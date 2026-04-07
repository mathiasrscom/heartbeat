import { useEffect, useState } from "react";
import { ProductBrandLabel } from "@/components/product-brand";
import { Button } from "@/components/ui/button";
import { panelSurfaceClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SupportProductFilterProps {
	availableProducts: string[];
	selectedProducts: string[];
	onChange: (products: string[]) => void;
	mode?: "app" | "wallboard";
	className?: string;
}

export function SupportProductFilter({
	availableProducts,
	selectedProducts,
	onChange,
	mode = "app",
	className,
}: SupportProductFilterProps) {
	const isWallboard = mode === "wallboard";
	const [draftSelectedProducts, setDraftSelectedProducts] =
		useState(selectedProducts);

	useEffect(() => {
		setDraftSelectedProducts(selectedProducts);
	}, [selectedProducts]);

	const hasChanges = (() => {
		if (draftSelectedProducts.length !== selectedProducts.length) return true;

		const selected = new Set(selectedProducts);
		return draftSelectedProducts.some(
			(productName) => !selected.has(productName),
		);
	})();

	useEffect(() => {
		if (!hasChanges) return;

		const timeoutId = window.setTimeout(() => {
			onChange(draftSelectedProducts);
		}, 180);

		return () => window.clearTimeout(timeoutId);
	}, [draftSelectedProducts, hasChanges, onChange]);

	function toggleProduct(productName: string) {
		if (draftSelectedProducts.includes(productName)) {
			setDraftSelectedProducts(
				draftSelectedProducts.filter((value) => value !== productName),
			);
			return;
		}

		setDraftSelectedProducts([...draftSelectedProducts, productName]);
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			<Button
				type="button"
				variant={draftSelectedProducts.length === 0 ? "secondary" : "ghost"}
				size="sm"
				className={cn(
					isWallboard && panelSurfaceClassName,
					isWallboard && "rounded-lg px-4",
					isWallboard &&
						"bg-background text-muted-foreground hover:border-border hover:text-foreground",
					isWallboard &&
						draftSelectedProducts.length === 0 &&
						"border-border bg-card text-foreground",
				)}
				onClick={() => setDraftSelectedProducts([])}
			>
				All products
			</Button>

			{availableProducts.map((productName) => {
				const selected = draftSelectedProducts.includes(productName);
				return (
					<Button
						key={productName}
						type="button"
						variant={selected ? "secondary" : "ghost"}
						size="sm"
						className={cn(
							isWallboard && panelSurfaceClassName,
							isWallboard && "rounded-lg px-4",
							isWallboard &&
								"bg-background text-muted-foreground hover:border-border hover:text-foreground",
							isWallboard &&
								selected &&
								"border-border bg-card text-foreground",
						)}
						onClick={() => toggleProduct(productName)}
					>
						<ProductBrandLabel productName={productName} logoSize="xs" />
					</Button>
				);
			})}
		</div>
	);
}
