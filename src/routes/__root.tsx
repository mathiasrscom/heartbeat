import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Monitor, SearchX, Settings2 } from "lucide-react";
import { SettingsDialogProvider } from "@/components/settings-dialog-provider";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Heartbeat",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				type: "image/png",
				href: "/product_support_logo.png",
			},
			{
				rel: "apple-touch-icon",
				href: "/product_support_logo.png",
			},
		],
	}),

	shellComponent: RootDocument,
	component: RootLayout,
	notFoundComponent: RootNotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function RootLayout() {
	return (
		<SettingsDialogProvider>
			<Outlet />
		</SettingsDialogProvider>
	);
}

function RootNotFound() {
	const location = useLocation();
	const isWallboardPath = location.pathname.startsWith("/wallboard/");

	const content = (
		<Card className="w-full max-w-xl border-border/70 shadow-sm">
			<CardHeader className="space-y-3">
				<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
					<SearchX className="h-6 w-6" />
				</div>
				<div className="space-y-1">
					<CardTitle>Page not found</CardTitle>
					<CardDescription>
						`{location.pathname}` does not match a route in Heartbeat.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<Link to="/wallboard/attention">
					<Button>
						<Monitor className="h-4 w-4" />
						Attention now
					</Button>
				</Link>
				<Link to="/wallboard/pulse">
					<Button variant="outline">
						<Monitor className="h-4 w-4" />
						Customer pulse
					</Button>
				</Link>
				<Link to="/settings">
					<Button variant="ghost">
						<Settings2 className="h-4 w-4" />
						Settings
					</Button>
				</Link>
			</CardContent>
		</Card>
	);

	if (isWallboardPath) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background px-6">
				{content}
			</div>
		);
	}

	return (
		<div className="flex min-h-full items-center justify-center px-6 py-10">
			{content}
		</div>
	);
}
