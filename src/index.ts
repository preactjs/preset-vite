import type { Plugin, ResolvedConfig } from "vite";
import type { FilterPattern } from "@rollup/pluginutils";
import type { ParserPlugin, ParserOptions } from "@babel/parser";
import type { TransformOptions } from "@babel/core";

import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools.js";
import { createFilter, parseId } from "./utils.js";
import { transformAsync } from "@babel/core";

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
	include,
	exclude,
	babel,
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

	const shouldTransform = createFilter(
		include || [/\.[tj]sx?$/],
		exclude || [/node_modules/],
	);

	devToolsEnabled = devToolsEnabled ?? true;
	prefreshEnabled = prefreshEnabled ?? true;
	reactAliasesEnabled = reactAliasesEnabled ?? true;

	const jsxPlugin: Plugin = {
		name: "vite:preact-jsx",
		enforce: "pre",
		config() {
			return {
				optimizeDeps: {
					include: ["preact/jsx-runtime", "preact/jsx-dev-runtime"],
				},
			};
		},
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		async transform(code, url) {
			// Ignore query parameters, as in Vue SFC virtual modules.
			const { id } = parseId(url);

			if (!shouldTransform(id)) return;

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
						config.isProduction
							? "@babel/plugin-transform-react-jsx"
							: "@babel/plugin-transform-react-jsx-development",
						{
							runtime: "automatic",
							importSource: "preact",
						},
					],
					...(config.isProduction ? [] : ["babel-plugin-transform-hook-names"]),
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
		...(devToolsEnabled
			? [
					preactDevtoolsPlugin({
						injectInProd: devtoolsInProd,
						shouldTransform,
					}),
			  ]
			: []),
		...(prefreshEnabled
			? [prefresh({ include, exclude, parserPlugins: baseParserOptions })]
			: []),
	];
}

export default preactPlugin;
export { preactPlugin as preact };
