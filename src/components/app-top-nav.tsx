import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, LineChart, Monitor, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
	{
		label: "Dashboard",
		to: "/",
		icon: LayoutDashboard,
	},
	{
		label: "Live",
		to: "/wallboard/live",
		icon: Monitor,
	},
	{
		label: "Trends",
		to: "/wallboard/trends",
		icon: LineChart,
	},
	{
		label: "Settings",
		to: "/settings",
		icon: Settings,
	},
] as const;

function isActivePath(pathname: string, to: (typeof navItems)[number]["to"]) {
	if (to === "/") return pathname === to;
	return pathname === to || pathname.startsWith(`${to}/`);
}

export function AppTopNav() {
	const location = useLocation();

	return (
		<header className="sticky top-0 z-30 border-b border-border bg-background">
			<div className="mx-auto flex min-h-14 max-w-7xl items-center gap-4 px-4 lg:px-6">
				<Link
					to="/"
					className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground"
				>
					<span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white">
						<img
							src="/product_support_logo.png"
							alt="Product Support logo"
							className="h-5 w-5 rounded-sm object-contain"
							loading="lazy"
						/>
					</span>
					<span>Heartbeat</span>
				</Link>

				<nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{navItems.map((item) => {
						const isActive = isActivePath(location.pathname, item.to);
						return (
							<Link
								key={item.to}
								to={item.to}
								aria-label={item.label}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors",
									"hover:bg-accent hover:text-foreground",
									isActive && "bg-accent text-foreground",
								)}
							>
								<item.icon className="h-4 w-4" />
								<span className="hidden sm:inline">{item.label}</span>
							</Link>
						);
					})}
				</nav>
			</div>
		</header>
	);
}
