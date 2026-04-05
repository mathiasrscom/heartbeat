import { Link, useLocation } from "@tanstack/react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuButtonText,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  Settings,
  Monitor,
  LineChart,
} from "lucide-react"

const primaryNav = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
]

const wallboardNav = [
  {
    label: "Live Wallboard",
    href: "/wallboard/live",
    icon: Monitor,
  },
  {
    label: "Trends Wallboard",
    href: "/wallboard/trends",
    icon: LineChart,
  },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      {/* Header with logo */}
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-white">
            <img
              src="/product_support_logo.png"
              alt="Product Support logo"
              className="h-6 w-6 rounded-sm object-contain"
              loading="lazy"
            />
          </div>
          <SidebarMenuButtonText>
            <span className="text-lg font-semibold">Heartbeat</span>
          </SidebarMenuButtonText>
        </Link>
      </SidebarHeader>

      {/* Main content */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <SidebarMenuItem key={item.href}>
                    <Link to={item.href}>
                      <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                        <item.icon className="h-4 w-4" />
                        <SidebarMenuButtonText>{item.label}</SidebarMenuButtonText>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Wallboards</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {wallboardNav.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <SidebarMenuItem key={item.href}>
                    <a href={item.href} target="_blank" rel="noreferrer">
                      <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                        <item.icon className="h-4 w-4" />
                        <SidebarMenuButtonText>{item.label}</SidebarMenuButtonText>
                      </SidebarMenuButton>
                    </a>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link to="/settings">
                  <SidebarMenuButton
                    isActive={location.pathname === "/settings"}
                    tooltip="Settings"
                  >
                    <Settings className="h-4 w-4" />
                    <SidebarMenuButtonText>Settings</SidebarMenuButtonText>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
