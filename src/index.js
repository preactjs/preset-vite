import prefresh from "@prefresh/vite";
import { vitePrerenderPlugin } from "vite-prerender-plugin";
import { transformAsync } from "@babel/core";
// @ts-ignore package doesn't ship with declaration files
import babelReactJsx from "@babel/plugin-transform-react-jsx";
// @ts-ignore package doesn't ship with declaration files
import babelReactJsxDev from "@babel/plugin-transform-react-jsx-development";
// @ts-ignore package doesn't ship with declaration files
import babelHookNames from "babel-plugin-transform-hook-names";
import { preactDevtoolsPlugin } from "./devtools.js";
import { createFilter, parseId } from "./utils.js";

/**
 * @typedef {import('vite').Plugin} Plugin
 * @typedef {import('vite').ResolvedConfig} ResolvedConfig
 * @typedef {import('@babel/parser').ParserPlugin} ParserPlugin
 *
 * @typedef {import('./index.d.ts').preact} PreactPlugin
 * @typedef {import('./index.d.ts').PreactBabelOptions} PreactBabelOptions
 */

/**
 * Taken from https://github.com/vitejs/vite/blob/main/packages/plugin-react/src/index.ts
 *
 * @type {PreactPlugin}
 */
function preactPlugin({
	devToolsEnabled,
	prefreshEnabled,
	reactAliasesEnabled,
	prerender,
	include,
	exclude,
	babel,
	jsxImportSource,
} = {}) {
	const baseParserOptions = [
		"importMeta",
		"explicitResourceManagement",
		"topLevelAwait",
	];
	/** @type {ResolvedConfig} */
	let config;

	let babelOptions = /** @type {PreactBabelOptions} */ ({
		babelrc: false,
		configFile: false,
		...babel,
	});

	babelOptions.plugins ||= [];
	babelOptions.presets ||= [];
	babelOptions.overrides ||= [];
	babelOptions.parserOpts ||= /** @type {any} */ ({});
	babelOptions.parserOpts.plugins ||= [];

	let useBabel = typeof babel !== "undefined";
	const shouldTransform = createFilter(
		include || [/\.[cm]?[tj]sx?$/],
		exclude || [/node_modules/],
	);

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

	/** @type {Plugin} */
	const jsxPlugin = {
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
				esbuild: useBabel
					? undefined
					: {
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
			devToolsEnabled = devToolsEnabled ?? !config.isProduction;
			useBabel ||= !config.isProduction || !!devToolsEnabled;
		},
		async transform(code, url) {
			// Ignore query parameters, as in Vue SFC virtual modules.
			const { id } = parseId(url);

			if (!useBabel || !shouldTransform(id)) return;

			const parserPlugins = /** @type {ParserPlugin[]} */ ([
				...baseParserOptions,
				"classProperties",
				"classPrivateProperties",
				"classPrivateMethods",
				!/\.[cm]?ts$/.test(id) && "jsx",
				// Babel doesn't support many transforms without also transforming TS.
				// Whilst our limited transforms (JSX & hook names) are fine, if users
				// add their own, they may run into unhelpful errors. See #170
				/\.[cm]?tsx?$/.test(id) && typeof babel === "undefined" && "typescript",
			].filter(Boolean));

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
				inputSourceMap: undefined,
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
		preactDevtoolsPlugin({
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
