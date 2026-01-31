import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Key,
  Plug,
  Bot,
  Bell,
  XCircle,
} from "lucide-react"

export const Route = createFileRoute("/settings")({ component: SettingsPage })

function SettingsPage() {
  return (
    <div className="p-4 lg:p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Configure integrations and preferences
        </p>
      </div>

      <div className="space-y-3">
        {/* Intercom Integration */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <Plug className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium">Intercom</span>
                <span className="text-[10px] text-muted-foreground ml-2">Sync conversations & CX data</span>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                <XCircle className="h-2.5 w-2.5 text-red-500" />
                Not connected
              </Badge>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Access token"
                className="flex-1 h-7 text-xs"
              />
              <Button size="sm" className="h-7 text-xs px-3">Connect</Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Get from Intercom → Settings → Developers → Access Token
            </p>
          </CardContent>
        </Card>

        {/* AI Provider */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-purple-500/10">
                <Bot className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <span className="text-xs font-medium">AI Provider</span>
              <span className="text-[10px] text-muted-foreground">for analysis & action parsing</span>
            </div>

            <div className="flex gap-1.5 mb-2">
              <label className="flex-1 flex items-center gap-1.5 p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-xs">
                <input type="radio" name="ai-provider" className="accent-primary h-3 w-3" />
                <div>
                  <div className="font-medium">OpenAI</div>
                  <div className="text-[10px] text-muted-foreground">GPT-4o</div>
                </div>
              </label>
              <label className="flex-1 flex items-center gap-1.5 p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-xs">
                <input type="radio" name="ai-provider" className="accent-primary h-3 w-3" defaultChecked />
                <div>
                  <div className="font-medium">Anthropic</div>
                  <div className="text-[10px] text-muted-foreground">Claude</div>
                </div>
              </label>
              <label className="flex-1 flex items-center gap-1.5 p-2 rounded-md border cursor-pointer hover:bg-muted/50 text-xs">
                <input type="radio" name="ai-provider" className="accent-primary h-3 w-3" />
                <div>
                  <div className="font-medium">Ollama</div>
                  <div className="text-[10px] text-muted-foreground">Local</div>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="API key"
                className="flex-1 h-7 text-xs"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs px-3">Save</Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-yellow-500/10">
                <Bell className="h-3.5 w-3.5 text-yellow-600" />
              </div>
              <span className="text-xs font-medium">Notifications</span>
              <span className="text-[10px] text-muted-foreground">where to send alerts</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="Slack webhook URL"
                className="flex-1 h-7 text-xs"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs px-3">Test</Button>
            </div>
          </CardContent>
        </Card>

        {/* Neuphlo Integration */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-md bg-green-500/10">
                <Key className="h-3.5 w-3.5 text-green-600" />
              </div>
              <div className="flex-1">
                <span className="text-xs font-medium">Neuphlo</span>
                <span className="text-[10px] text-muted-foreground ml-2">Push insights & create nodes</span>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                <XCircle className="h-2.5 w-2.5 text-red-500" />
                Not connected
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Input
                type="url"
                placeholder="API URL"
                className="h-7 text-xs"
              />
              <Input
                type="password"
                placeholder="API key"
                className="h-7 text-xs"
              />
            </div>
            <Button size="sm" className="h-7 text-xs px-3 w-full">Connect</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
