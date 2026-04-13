import type { ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
const wbCell = "rounded-lg border border-border/30 bg-white dark:border-transparent dark:bg-muted/50";
import { buildIntercomCaseUrl } from "@/lib/intercom-links";
import type { CaseLookupItem } from "@/lib/support-health/types";
import { cn } from "@/lib/utils";

export function CaseLookupCard({
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
	const assignee = item.assigneeName?.trim() || null;

	return (
		<article className={cn(wbCell, "flex items-center gap-3 px-3 py-2")}>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					{href ? (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							className="font-mono text-sm font-semibold text-foreground underline decoration-border underline-offset-2 hover:text-primary"
						>
							#{item.externalId || item.id}
						</a>
					) : (
						<span className="font-mono text-sm font-semibold text-foreground">
							#{item.externalId || item.id}
						</span>
					)}
					<LookupMetaPill>{item.subtype === "ticket" ? "Ticket" : "Conv"}</LookupMetaPill>
					{item.isHighRisk ? (
						<LookupMetaPill tone="danger">Risk</LookupMetaPill>
					) : null}
				</div>
				<div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
					{assignee ? (
						<Avatar className="h-4 w-4 border border-border/40">
							{item.assigneeAvatarUrl ? (
								<AvatarImage src={item.assigneeAvatarUrl} alt={assignee} />
							) : null}
							<AvatarFallback className="bg-muted text-[7px] text-foreground">
								{assignee.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					) : null}
					<span>{assignee ?? "No owner"} · {item.ageLabel}</span>
				</div>
			</div>
			<div
				className={cn(
					"shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium",
					getStatusBadgeClassName(item),
				)}
			>
				{item.stateLabel}
			</div>
		</article>
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
				"inline-flex items-center rounded px-1 py-0.5 text-[10px]",
				tone === "danger"
					? "border-red-300/40 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300"
					: "bg-muted/60 text-muted-foreground",
			)}
		>
			{children}
		</span>
	);
}

function getStatusBadgeClassName(item: CaseLookupItem) {
	if (item.isBreached) {
		return "border-red-300/40 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300";
	}

	if (item.isDueSoon || !item.assigneeName?.trim()) {
		return "border-amber-300/40 dark:border-amber-400/30 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300";
	}

	return "border-border/60 bg-background text-foreground";
}
