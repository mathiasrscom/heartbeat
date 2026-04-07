import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cardSurfaceClassName } from "@/components/ui/card";
import { buildIntercomCaseUrl } from "@/lib/intercom-links";
import type { CaseLookupItem } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";
import { ProductBrandLabel } from "../product-brand";

export function CaseLookupCard({
	item,
	appUrl,
}: {
	item: CaseLookupItem;
	appUrl: string | null;
}) {
	return (
		<article className={cn(cardSurfaceClassName, "px-3 py-3")}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<ProductBrandLabel
							productName={item.productName}
							logoSize="sm"
							className="text-[13px] font-medium text-foreground"
						/>
						<LookupMetaPill>{formatLookupSubtype(item.subtype)}</LookupMetaPill>
						{item.isHighRisk ? (
							<LookupMetaPill tone="danger">High risk</LookupMetaPill>
						) : null}
					</div>
					<div className="mt-2">
						<CaseLink item={item} appUrl={appUrl} />
					</div>
				</div>
				<div className="shrink-0 text-right">
					<div
						className={cn(
							"inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium",
							getStatusBadgeClassName(item),
						)}
					>
						{item.stateLabel}
					</div>
					<div className="mt-1 text-xs text-muted-foreground">
						{item.ageLabel}
					</div>
				</div>
			</div>

			<div className="mt-3 grid gap-2 border-t border-border/40 pt-2.5 sm:grid-cols-2">
				<div className="min-w-0">
					<div className="text-[11px] text-muted-foreground">Owner</div>
					<div className="mt-0.5">
						<LookupAssignee item={item} />
					</div>
				</div>
				<div className="min-w-0">
					<div className="text-[11px] text-muted-foreground">Queue</div>
					<div className="mt-0.5 truncate text-[13px] text-foreground">
						{item.queueName}
					</div>
				</div>
			</div>
		</article>
	);
}

function CaseLink({
	item,
	appUrl,
}: {
	item: CaseLookupItem;
	appUrl: string | null;
}) {
	const href = buildIntercomCaseUrl(appUrl, {
		externalId: item.externalId,
		subtype: item.subtype,
	});

	if (!href) {
		return <>#{formatLookupId(item)}</>;
	}

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			title={`#${formatLookupId(item)}`}
			className="block truncate whitespace-nowrap font-mono text-[1.28rem] font-semibold leading-none tracking-tight text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary sm:text-[1.42rem]"
		>
			#{formatLookupId(item)}
		</a>
	);
}

function LookupAssignee({ item }: { item: CaseLookupItem }) {
	const assignedName = item.assigneeName?.trim() || null;

	if (!assignedName) {
		return (
			<span className="text-[13px] text-muted-foreground">No owner set</span>
		);
	}

	return (
		<div className="flex min-w-0 items-center gap-2">
			<Avatar className="h-7 w-7 border border-border/60">
				{item.assigneeAvatarUrl ? (
					<AvatarImage src={item.assigneeAvatarUrl} alt={assignedName} />
				) : null}
				<AvatarFallback className="bg-muted text-[10px] text-foreground">
					{toInitials(assignedName)}
				</AvatarFallback>
			</Avatar>
			<span className="truncate text-[13px] text-foreground">
				{assignedName}
			</span>
		</div>
	);
}

function LookupMetaPill({
	children,
	tone = "default",
}: {
	children: ReactNode;
	tone?: "default" | "danger";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px]",
				tone === "danger"
					? "border-red-400/30 bg-red-500/10 text-red-300"
					: "border-border/50 bg-background text-muted-foreground",
			)}
		>
			{children}
		</span>
	);
}

function formatLookupId(item: CaseLookupItem) {
	return item.externalId || item.id;
}

function formatLookupSubtype(subtype: CaseLookupItem["subtype"]) {
	return subtype === "ticket" ? "Ticket" : "Conversation";
}

function toInitials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);

	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

	return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function getStatusBadgeClassName(item: CaseLookupItem) {
	if (item.isBreached) {
		return "border-red-400/30 bg-red-500/10 text-red-300";
	}

	if (item.isDueSoon || !item.assigneeName?.trim()) {
		return "border-amber-400/30 bg-amber-500/10 text-amber-300";
	}

	return "border-border/60 bg-background text-foreground";
}
