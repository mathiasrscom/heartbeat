import { describe, expect, it } from "vitest";
import {
	extractClientEntrySources,
	shouldReloadForNewDeployment,
} from "./wallboard-deployment-refresh";

describe("wallboard deployment refresh", () => {
	it("extracts the production client entry", () => {
		expect(
			extractClientEntrySources(
				'<script type="module" src="/assets/main-current.js"></script>',
			),
		).toEqual(["/assets/main-current.js"]);
	});

	it("does not reload when the deployment is unchanged", () => {
		expect(
			shouldReloadForNewDeployment(
				["https://heartbeat.example/assets/main-current.js"],
				'<script src="/assets/main-current.js"></script>',
			),
		).toBe(false);
	});

	it("reloads only when a different production entry is available", () => {
		expect(
			shouldReloadForNewDeployment(
				["/assets/main-current.js"],
				'<script src="/assets/main-next.js"></script>',
			),
		).toBe(true);
		expect(shouldReloadForNewDeployment([], "<html></html>")).toBe(false);
	});
});
