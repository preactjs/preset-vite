import { defineConfig } from "vite";
import preact from "../src/index";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		preact({
			prerender: {
				enabled: true,
				renderTarget: "#app",
				additionalPrerenderRoutes: ["/404"],
				previewMiddlewareEnabled: true,
				previewMiddlewareFallback: "/404",
			},
		}),
	],
});
