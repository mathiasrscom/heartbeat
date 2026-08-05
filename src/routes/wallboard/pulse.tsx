import { createFileRoute } from "@tanstack/react-router";
import type { WallboardPulsePeriod } from "@/lib/intercom-admin";
import { getTrendsWallboard } from "@/lib/support-health/server";
import { CustomerPulseWallboard } from "./trends";

function normalizePulsePeriod(
	value: unknown,
): WallboardPulsePeriod | undefined {
	const periods: WallboardPulsePeriod[] = [
		"current-week",
		"previous-week",
		"rolling-30-days",
		"rolling-90-days",
		"rolling-180-days",
	];
	return periods.includes(value as WallboardPulsePeriod)
		? (value as WallboardPulsePeriod)
		: undefined;
}

export const Route = createFileRoute("/wallboard/pulse")({
	ssr: false,
	head: () => ({ meta: [{ title: "Heartbeat - Customer pulse" }] }),
	validateSearch: (search: Record<string, unknown>) => ({
		period: normalizePulsePeriod(search.period),
	}),
	loaderDeps: ({ search }) => ({ period: search.period }),
	loader: async ({ deps }) =>
		getTrendsWallboard({
			data: deps.period ? { period: deps.period } : undefined,
		}),
	component: PulsePage,
});

function PulsePage() {
	return <CustomerPulseWallboard data={Route.useLoaderData()} />;
}
