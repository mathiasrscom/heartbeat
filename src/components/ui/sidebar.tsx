import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { PanelLeft } from "lucide-react"

// Context for sidebar state
interface SidebarContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  isMobile: boolean
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

// Provider
interface SidebarProviderProps {
  children: React.ReactNode
  defaultOpen?: boolean
}

function SidebarProvider({ children, defaultOpen = true }: SidebarProviderProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen, isMobile }}>
      {children}
    </SidebarContext.Provider>
  )
}

// Trigger button
function SidebarTrigger({ className }: { className?: string }) {
  const { setIsOpen, isOpen } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={() => setIsOpen(!isOpen)}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
}

// Main sidebar
interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "inset"
}

function Sidebar({ className, variant = "default", children, ...props }: SidebarProps) {
  const { isOpen, isMobile } = useSidebar()

  if (isMobile && !isOpen) {
    return null
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        isOpen ? "w-64" : "w-16",
        variant === "inset" && "bg-background",
        className
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

// Sidebar header
function SidebarHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-14 items-center border-b px-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// Sidebar content
function SidebarContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 overflow-auto py-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// Sidebar footer
function SidebarFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t p-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// Sidebar group
function SidebarGroup({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-2 py-2", className)} {...props}>
      {children}
    </div>
  )
}

// Sidebar group label
function SidebarGroupLabel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = useSidebar()
  if (!isOpen) return null
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Sidebar group content
function SidebarGroupContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-1", className)} {...props}>
      {children}
    </div>
  )
}

// Sidebar menu
function SidebarMenu({ className, children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cn("space-y-1", className)} {...props}>
      {children}
    </ul>
  )
}

// Sidebar menu item
function SidebarMenuItem({ className, children, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li className={cn("", className)} {...props}>
      {children}
    </li>
  )
}

// Sidebar menu button
interface SidebarMenuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  asChild?: boolean
  tooltip?: string
}

function SidebarMenuButton({
  className,
  isActive,
  children,
  tooltip,
  ...props
}: SidebarMenuButtonProps) {
  const { isOpen } = useSidebar()

  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        !isOpen && "justify-center px-2",
        className
      )}
      title={!isOpen ? tooltip : undefined}
      {...props}
    >
      {children}
    </button>
  )
}

// Sidebar menu button text (hides when collapsed)
function SidebarMenuButtonText({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar()
  if (!isOpen) return null
  return <span>{children}</span>
}

// Sidebar inset (main content area)
function SidebarInset({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-auto", className)} {...props}>
      {children}
    </div>
  )
}

export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuButtonText,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
}
