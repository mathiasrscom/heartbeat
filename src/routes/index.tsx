import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: App });

function App() {
  return (
    <div className="min-h-screen text-center text-4xl font-bold pt-60">
      Heartbeat
    </div>
  );
}
