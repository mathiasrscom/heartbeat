import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
	routeRules: {
		// HTML documents should always revalidate so a browser refresh after
		// deploy picks up the current asset manifest instead of stale route HTML.
		"/**": {
			headers: {
				"cache-control": "no-cache, no-store, must-revalidate",
			},
		},
	},
});
