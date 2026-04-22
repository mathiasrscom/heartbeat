import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

const disableDevtoolsEventBus =
	process.env.HEARTBEAT_DISABLE_DEVTOOLS_EVENT_BUS === "1";

const config = defineConfig({
	resolve: {
		dedupe: ["react", "react-dom"],
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	ssr: {
		external: [
			"react",
			"react/jsx-runtime",
			"react/jsx-dev-runtime",
			"react-dom",
			"react-dom/client",
			"react-dom/server",
			"recharts",
		],
	},
	plugins: [
		devtools({
			eventBusConfig: {
				enabled: !disableDevtoolsEventBus,
			},
		}),
		nitro(),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
