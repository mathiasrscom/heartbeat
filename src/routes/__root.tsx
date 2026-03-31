import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Monitor, SearchX, Settings2 } from "lucide-react";

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
  const location = useLocation()

  if (location.pathname.startsWith("/wallboard/")) {
    return <Outlet />
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          {/* Top bar with sidebar trigger */}
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <div className="flex-1" />
          </header>
          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function RootNotFound() {
  const location = useLocation()
  const isWallboardPath = location.pathname.startsWith("/wallboard/")

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
        <Link to="/">
          <Button>
            <SearchX className="h-4 w-4" />
            Dashboard
          </Button>
        </Link>
        <Link to="/wallboard/live">
          <Button variant="outline">
            <Monitor className="h-4 w-4" />
            Live wallboard
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
  )

  if (isWallboardPath) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        {content}
      </div>
    )
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      {content}
    </div>
  )
}
