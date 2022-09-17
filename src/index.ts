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
	include,
	exclude,
	babel,
	jsxImportSource,
}: PreactPluginOptions = {}): Plugin[] {
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
				"importMeta",
				// This plugin is applied before esbuild transforms the code,
				// so we need to enable some stage 3 syntax that is supported in
				// TypeScript and some environments already.
				"topLevelAwait",
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
							importSource: jsxImportSource ?? "preact",
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
		jsxPlugin,
		preactDevtoolsPlugin({ injectInProd: devtoolsInProd, shouldTransform }),
		prefresh({ include, exclude }),
	];
}

export default preactPlugin;
export { preactPlugin as preact };
