import { Heart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ProductBrandStyle = {
	ringClassName: string;
	heartClassName: string;
};

const PRODUCT_BRAND_STYLES: Record<string, ProductBrandStyle> = {
	"addo sign": {
		ringClassName:
			"border-amber-400/50 dark:border-amber-300/50 bg-amber-100/60 dark:bg-amber-300/15",
		heartClassName: "text-amber-500 dark:text-amber-300",
	},
	twoday: {
		ringClassName:
			"border-slate-400/45 dark:border-slate-300/45 bg-slate-100/60 dark:bg-slate-300/15",
		heartClassName: "text-slate-500 dark:text-slate-200",
	},
	"pension broker": {
		ringClassName:
			"border-emerald-400/55 dark:border-emerald-300/55 bg-emerald-100/60 dark:bg-emerald-300/15",
		heartClassName: "text-emerald-500 dark:text-emerald-300",
	},
};

const PRODUCT_LOGO_PATHS: Record<string, string> = {
	"addo sign": "/product-logos/addo_sign_logo.png",
	twoday: "/product-logos/twoday_logo.jpeg",
	"pension broker": "/product-logos/pension_broker_logo.png",
};

const DEFAULT_BRAND_STYLE: ProductBrandStyle = {
	ringClassName: "border-border/60 bg-muted",
	heartClassName: "text-muted-foreground",
};

function normalizeProductKey(productName: string | null | undefined) {
	return (productName ?? "").trim().toLowerCase();
}

function resolveCanonicalBrandKey(productName: string | null | undefined) {
	const key = normalizeProductKey(productName);

	if (key.includes("pension broker")) return "pension broker";
	if (key.includes("cvr")) return "pension broker";
	if (key.includes("aftaleportalen")) return "pension broker";
	if (key.includes("addo sign")) return "addo sign";
	if (key.includes("twoday")) return "twoday";

	return key;
}

function resolveBrandStyle(productName: string | null | undefined) {
	return (
		PRODUCT_BRAND_STYLES[resolveCanonicalBrandKey(productName)] ??
		DEFAULT_BRAND_STYLE
	);
}

function resolveBrandLogoPath(productName: string | null | undefined) {
	return PRODUCT_LOGO_PATHS[resolveCanonicalBrandKey(productName)] ?? null;
}

export function formatProductLabel(productName: string | null | undefined) {
	if (!productName) return "All products";
	return productName === "Unmapped" ? "Needs mapping" : productName;
}

export function ProductBrandLogo({
	productName,
	size = "sm",
	className,
}: {
	productName: string | null | undefined;
	size?: "xs" | "sm" | "md";
	className?: string;
}) {
	const label = formatProductLabel(productName);
	const brand = resolveBrandStyle(productName);
	const logoPath = useMemo(
		() => resolveBrandLogoPath(productName),
		[productName],
	);
	const [isLogoBroken, setIsLogoBroken] = useState(false);

	useEffect(() => {
		void logoPath;
		setIsLogoBroken(false);
	}, [logoPath]);

	return (
		<span
			aria-hidden
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full border",
				size === "xs" && "h-4 w-4",
				size === "sm" && "h-5 w-5",
				size === "md" && "h-6 w-6",
				brand.ringClassName,
				className,
			)}
		>
			{logoPath && !isLogoBroken ? (
				<img
					src={logoPath}
					alt={`${label} logo`}
					className={cn(
						"rounded-full object-cover",
						size === "xs" && "h-3 w-3",
						size === "sm" && "h-4 w-4",
						size === "md" && "h-5 w-5",
					)}
					onError={() => setIsLogoBroken(true)}
					loading="lazy"
				/>
			) : (
				<Heart
					className={cn(
						size === "xs" && "h-2.5 w-2.5",
						size === "sm" && "h-3 w-3",
						size === "md" && "h-3.5 w-3.5",
						brand.heartClassName,
					)}
				/>
			)}
		</span>
	);
}

export function ProductBrandLabel({
	productName,
	logoSize = "sm",
	className,
}: {
	productName: string | null | undefined;
	logoSize?: "xs" | "sm" | "md";
	className?: string;
}) {
	return (
		<span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
			<ProductBrandLogo productName={productName} size={logoSize} />
			<span className="truncate">{formatProductLabel(productName)}</span>
		</span>
	);
}
