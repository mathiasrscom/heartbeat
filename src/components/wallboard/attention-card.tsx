import {
	ArrowUpRight,
	CircleAlert,
	Code2,
	Crown,
	Headphones,
	Users,
} from "lucide-react";
import { buildIntercomCaseUrl } from "@/lib/intercom-links";
import type { CustomerAttentionSignal } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

const ownerConfig = {
	support: { label: "Support", icon: Headphones },
	development: { label: "Development", icon: Code2 },
	leadership: { label: "Leadership", icon: Crown },
	shared: { label: "Shared", icon: Users },
};

export function AttentionCard({
	signal,
	appUrl,
	compact = false,
}: {
	signal: CustomerAttentionSignal;
	appUrl: string | null;
	compact?: boolean;
}) {
	const owner = ownerConfig[signal.owner];
	const OwnerIcon = owner.icon;
	return (
		<article
			className={cn(
				"relative overflow-hidden rounded-2xl border bg-bg-surface/80",
				compact ? "px-5 py-4" : "px-6 py-5",
				signal.severity === "critical" && "border-danger/35",
				signal.severity === "important" && "border-warning/30",
				signal.severity === "watch" && "border-border/60",
			)}
		>
			<div
				className={cn(
					"absolute inset-y-0 left-0 w-1",
					signal.severity === "critical" && "bg-danger",
					signal.severity === "important" && "bg-warning",
					signal.severity === "watch" && "bg-info",
				)}
			/>
			<div className="grid grid-cols-1 items-start gap-4 @min-[520px]:grid-cols-[minmax(0,1fr)_auto] @min-[520px]:gap-5">
				<div className="min-w-0 flex-1">
					<div className="mb-2 flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
						<span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-foreground/80">
							<OwnerIcon className="h-3.5 w-3.5" />
							{owner.label} next
						</span>
						{signal.productNames.slice(0, 2).map((product) => (
							<span key={product}>{product}</span>
						))}
					</div>
					<h3
						className={cn(
							"font-semibold leading-tight tracking-tight text-foreground",
							compact ? "text-xl" : "text-2xl",
						)}
					>
						{signal.headline}
					</h3>
					<p
						className={cn(
							"mt-2 leading-relaxed text-text-secondary",
							compact ? "line-clamp-1 text-sm" : "text-base",
						)}
					>
						{signal.summary}
					</p>
				</div>
				<div className="flex items-center justify-between gap-4 text-left @min-[520px]:block @min-[520px]:text-right">
					<div className="text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
						Evidence
					</div>
					<div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
						{signal.kind === "product"
							? signal.affectedCustomerCount
							: signal.conversationExternalIds.length}
					</div>
					<div className="text-xs text-muted-foreground">
						{signal.kind === "product" ? "customers" : "case"}
					</div>
				</div>
			</div>

			<div className="mt-4 flex items-start gap-2 border-t border-border/40 pt-3 text-sm text-foreground">
				<CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
				<span>
					<span className="font-semibold">Next:</span> {signal.suggestedAction}
				</span>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				{signal.conversationExternalIds.slice(0, 4).map((externalId) => {
					const href = buildIntercomCaseUrl(appUrl, {
						externalId,
						subtype: "conversation",
					});
					return href ? (
						<a
							key={externalId}
							href={href}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-accent-primary hover:text-accent-hover"
						>
							Case #{externalId}
							<ArrowUpRight className="h-3.5 w-3.5" />
						</a>
					) : (
						<span
							key={externalId}
							className="font-mono text-sm text-muted-foreground"
						>
							Case #{externalId}
						</span>
					);
				})}
				{signal.reasons
					.filter((reason) => reason !== "no clear owner")
					.map((reason) => (
						<span
							key={reason}
							className="rounded-md bg-background/65 px-2 py-1 text-xs text-muted-foreground"
						>
							{reason}
						</span>
					))}
			</div>
		</article>
	);
}
