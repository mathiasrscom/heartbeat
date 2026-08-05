import { createFileRoute } from "@tanstack/react-router";
import { getLiveWallboard } from "@/lib/support-health/server";
import { AttentionWallboard } from "./live";

export const Route = createFileRoute("/wallboard/attention")({
	ssr: false,
	head: () => ({ meta: [{ title: "Heartbeat - Attention now" }] }),
	loader: async () => getLiveWallboard(),
	component: AttentionPage,
});

function AttentionPage() {
	return <AttentionWallboard live={Route.useLoaderData()} />;
}
