import { createFileRoute } from "@tanstack/react-router";
import { getTrendsWallboard } from "@/lib/support-health/server";
import { CustomerPulseWallboard } from "./trends";

export const Route = createFileRoute("/wallboard/pulse")({
	ssr: false,
	head: () => ({ meta: [{ title: "Heartbeat - Customer pulse" }] }),
	loader: async () => getTrendsWallboard(),
	component: PulsePage,
});

function PulsePage() {
	return <CustomerPulseWallboard data={Route.useLoaderData()} />;
}
