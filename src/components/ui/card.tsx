import type * as React from "react";
import { cn } from "@/lib/utils";

const cardBaseClassName =
	"rounded-xl border border-border/40 shadow-sm transition-colors";

const cardSurfaceClassName = cn(
	cardBaseClassName,
	"bg-card text-card-foreground",
);

const panelSurfaceClassName = cn(
	cardBaseClassName,
	"bg-background text-card-foreground",
);

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card"
			className={cn(
				cardSurfaceClassName,
				"flex flex-col gap-6 py-3",
				className,
			)}
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 py-2 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-3",
				className,
			)}
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			className={cn("font-semibold leading-none", className)}
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-action"
			className={cn(
				"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
				className,
			)}
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-6", className)}
			{...props}
		/>
	);
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
			{...props}
		/>
	);
}

function ActionCard({ className, ...props }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			data-slot="action-card"
			className={cn(
				panelSurfaceClassName,
				"cursor-pointer p-5 text-left hover:border-border",
				className,
			)}
			{...props}
		/>
	);
}

export {
	ActionCard,
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	cardSurfaceClassName,
	panelSurfaceClassName,
};
