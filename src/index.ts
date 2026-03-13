import type { Plugin, ResolvedConfig } from "vite";
import type { FilterPattern } from "@rollup/pluginutils";

import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools.js";
import { transformHookNamesPlugin } from "./transform-hook-names.js";
import { createFilter } from "./utils.js";
import { vitePrerenderPlugin } from "vite-prerender-plugin";

export interface PreactPluginOptions {
	/**
	 * Inject devtools bridge in production bundle instead of only in development mode.
	 * @default false
	 */
	devtoolsInProd?: boolean;

	/**
	 * Whether to use Preact devtools
	 * @default true
	 */
	devToolsEnabled?: boolean;

	/**
	 * Whether to use prefresh HMR
	 * @default true
	 */
	prefreshEnabled?: boolean;

	/**
	 * Whether to alias react, react-dom to preact/compat
	 * @default true
	 */
	reactAliasesEnabled?: boolean;

	/**
	 * Prerender plugin options
	 */
	prerender?: {
		/**
		 * Whether to prerender your app on build
		 */
		enabled: boolean;
		/**
		 * Absolute path to script containing an exported `prerender()` function
		 */
		prerenderScript?: string;
		/**
		 * Query selector for specifying where to insert prerender result in your HTML template
		 */
		renderTarget?: string;
		/**
		 * Additional routes that should be prerendered
		 */
		additionalPrerenderRoutes?: string[];
		/**
		 * Vite's preview server won't use our prerendered HTML by default, this middleware correct this
		 */
		previewMiddlewareEnabled?: boolean;
		/**
		 * Path to use as a fallback/404 route, i.e., `/404` or `/not-found`
		 */
		previewMiddlewareFallback?: string;
	};

	/**
	 * RegExp or glob to match files to be transformed
	 */
	include?: FilterPattern;

	/**
	 * RegExp or glob to match files to NOT be transformed
	 */
	exclude?: FilterPattern;

	/**
	 * Import Source for jsx. Defaults to "preact".
	 */
	jsxImportSource?: string;
}

// Taken from https://github.com/vitejs/vite/blob/main/packages/plugin-react/src/index.ts
function preactPlugin({
	devtoolsInProd,
	devToolsEnabled,
	prefreshEnabled,
	reactAliasesEnabled,
	prerender,
	include,
	exclude,
	jsxImportSource,
}: PreactPluginOptions = {}): Plugin[] {
	const baseParserOptions = [
		"importMeta",
		"explicitResourceManagement",
		"topLevelAwait",
	];
	let config: ResolvedConfig;

	const shouldTransform = createFilter(
		include || [/\.[cm]?[tj]sx?$/],
		exclude || [/node_modules/],
	);

	devtoolsInProd = devtoolsInProd ?? false;
	prefreshEnabled = prefreshEnabled ?? true;
	reactAliasesEnabled = reactAliasesEnabled ?? true;
	prerender = prerender ?? { enabled: false };

	const prerenderPlugin = vitePrerenderPlugin(prerender);
	if (!prerender.previewMiddlewareEnabled) {
		const idx = prerenderPlugin.findIndex(
			p => p.name == "serve-prerendered-html",
		);
		if (idx > -1) {
			prerenderPlugin.splice(idx, 1);
		}
	}

	const jsxPlugin: Plugin = {
		name: "vite:preact-jsx",
		enforce: "pre",
		config() {
			return {
				build: {
					rollupOptions: {
						onwarn(warning, warn) {
							if (
								warning.code === "MODULE_LEVEL_DIRECTIVE" &&
								warning.message.includes("use client")
							)
								return;
							warn(warning);
						},
					},
				},
				oxc: {
					jsx: {
						runtime: "automatic",
						importSource: jsxImportSource ?? "preact",
					},
				},
				optimizeDeps: {
					include: ["preact", "preact/jsx-runtime", "preact/jsx-dev-runtime"],
					rolldownOptions: {
						transform: { jsx: { runtime: "automatic" } },
					},
				},
			};
		},
		configResolved(resolvedConfig) {
			config = resolvedConfig;
			devToolsEnabled =
				devToolsEnabled ?? (!config.isProduction || devtoolsInProd);
		},
	};
	return [
		...(reactAliasesEnabled
			? [
					{
						name: "preact:config",
						config() {
							return {
								resolve: {
									alias: {
										"react-dom/test-utils": "preact/test-utils",
										"react-dom": "preact/compat",
										"react/jsx-runtime": "preact/jsx-runtime",
										react: "preact/compat",
									},
								},
							};
						},
					},
			  ]
			: []),
		jsxPlugin,
		transformHookNamesPlugin({
			devtoolsInProd,
			devToolsEnabled,
			shouldTransform,
		}),
		preactDevtoolsPlugin({
			devtoolsInProd,
			devToolsEnabled,
			shouldTransform,
		}),
		...(prefreshEnabled
			? [prefresh({ include, exclude, parserPlugins: baseParserOptions })]
			: []),
		...(prerender.enabled ? prerenderPlugin : []),
	];
}

export default preactPlugin;
export { preactPlugin as preact };
