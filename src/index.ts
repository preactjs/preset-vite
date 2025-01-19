import type { Plugin, ResolvedConfig } from "vite";
import type { FilterPattern } from "@rollup/pluginutils";
import type { ParserPlugin, ParserOptions } from "@babel/parser";
import type { TransformOptions } from "@babel/core";

import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools.js";
import { createFilter, parseId } from "./utils.js";
import { vitePrerenderPlugin } from "vite-prerender-plugin";
import { transformAsync } from "@babel/core";
// @ts-ignore package doesn't ship with declaration files
import babelReactJsx from "@babel/plugin-transform-react-jsx";
// @ts-ignore package doesn't ship with declaration files
import babelReactJsxDev from "@babel/plugin-transform-react-jsx-development";
// @ts-ignore package doesn't ship with declaration files
import babelHookNames from "babel-plugin-transform-hook-names";

export type BabelOptions = Omit<
	TransformOptions,
	| "ast"
	| "filename"
	| "root"
	| "sourceFileName"
	| "sourceMaps"
	| "inputSourceMap"
>;

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
	 * Babel configuration applied in both dev and prod.
	 */
	babel?: BabelOptions;
	/**
	 * Import Source for jsx. Defaults to "preact".
	 */
	jsxImportSource?: string;
}

export interface PreactBabelOptions extends BabelOptions {
	plugins: Extract<BabelOptions["plugins"], any[]>;
	presets: Extract<BabelOptions["presets"], any[]>;
	overrides: Extract<BabelOptions["overrides"], any[]>;
	parserOpts: ParserOptions & {
		plugins: Extract<ParserOptions["plugins"], any[]>;
	};
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
	babel,
	jsxImportSource,
}: PreactPluginOptions = {}): Plugin[] {
	const baseParserOptions = [
		"importMeta",
		"explicitResourceManagement",
		"topLevelAwait",
	];
	let config: ResolvedConfig;

	let babelOptions = {
		babelrc: false,
		configFile: false,
		...babel,
	} as PreactBabelOptions;

	babelOptions.plugins ||= [];
	babelOptions.presets ||= [];
	babelOptions.overrides ||= [];
	babelOptions.parserOpts ||= {} as any;
	babelOptions.parserOpts.plugins ||= [];

	let useBabel: boolean;
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
							// Silence Rollup's module-level directive warnings re:"use client".
							// They're likely to come from `node_modules` and won't be actionable.
							if (
								warning.code === "MODULE_LEVEL_DIRECTIVE" &&
								warning.message.includes("use client")
							)
								return;
							// ESBuild seemingly doesn't include mappings for directives, causing
							// Rollup to emit warnings about missing source locations. This too is
							// likely to come from `node_modules` and won't be actionable.
							// evanw/esbuild#3548
							if (
								warning.code === "SOURCEMAP_ERROR" &&
								warning.message.includes("resolve original location") &&
								warning.pos === 0
							)
								return;
							warn(warning);
						},
					},
				},
				// While this config is unconditional, it'll only be used if Babel is not
				esbuild: {
					jsx: "automatic",
					jsxImportSource: jsxImportSource ?? "preact",
				},
				optimizeDeps: {
					include: ["preact", "preact/jsx-runtime", "preact/jsx-dev-runtime"],
				},
			};
		},
		configResolved(resolvedConfig) {
			config = resolvedConfig;
			devToolsEnabled =
				devToolsEnabled ?? (!config.isProduction || devtoolsInProd);
			useBabel =
				!config.isProduction || devToolsEnabled || typeof babel !== "undefined";
		},
		async transform(code, url) {
			// Ignore query parameters, as in Vue SFC virtual modules.
			const { id } = parseId(url);

			if (!useBabel || !shouldTransform(id)) return;

			const parserPlugins = [
				...baseParserOptions,
				"classProperties",
				"classPrivateProperties",
				"classPrivateMethods",
				!id.endsWith(".ts") && "jsx",
				/\.tsx?$/.test(id) && "typescript",
			].filter(Boolean) as ParserPlugin[];

			const result = await transformAsync(code, {
				...babelOptions,
				ast: true,
				root: config.root,
				filename: id,
				parserOpts: {
					...babelOptions.parserOpts,
					sourceType: "module",
					allowAwaitOutsideFunction: true,
					plugins: parserPlugins,
				},
				generatorOpts: {
					...babelOptions.generatorOpts,
					decoratorsBeforeExport: true,
				},
				plugins: [
					...babelOptions.plugins,
					[
						config.isProduction ? babelReactJsx : babelReactJsxDev,
						{
							runtime: "automatic",
							importSource: jsxImportSource ?? "preact",
						},
					],
					...(devToolsEnabled ? [babelHookNames] : []),
				],
				sourceMaps: true,
				inputSourceMap: false as any,
			});

			// NOTE: Since no config file is being loaded, this path wouldn't occur.
			if (!result) return;

			return {
				code: result.code || code,
				map: result.map,
			};
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
										react: "preact/compat",
									},
								},
							};
						},
					},
			  ]
			: []),
		jsxPlugin,
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
