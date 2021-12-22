import type { Plugin, ResolvedConfig } from "vite";
import type { FilterPattern } from "@rollup/pluginutils";
import type { ParserPlugin } from "@babel/parser";

import resolve from "resolve";
import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools.js";
import { createFilter, parseId } from "./utils.js";
import { transformAsync } from "@babel/core";

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
}

// Taken from https://github.com/vitejs/vite/blob/main/packages/plugin-react/src/index.ts
export default function preactPlugin({
	devtoolsInProd,
	include,
	exclude,
}: PreactPluginOptions = {}): Plugin[] {
	let config: ResolvedConfig;

	const shouldTransform = createFilter(
		include || [/\.[tj]sx?$/],
		exclude || [/node_modules/, /\.git/],
	);

	const jsxPlugin: Plugin = {
		name: "vite:preact-jsx",
		enforce: "pre",
		config() {
			return {
				optimizeDeps: {
					include: ["preact/jsx-runtime"],
				},
			};
		},
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		resolveId(id: string) {
			return id === "preact/jsx-runtime" ? id : null;
		},
		load(id: string) {
			if (id === "preact/jsx-runtime") {
				const runtimePath = resolve.sync("preact/jsx-runtime", {
					basedir: config.root,
				});
				const exports = ["jsx", "jsxs", "Fragment"];
				return [
					`import * as jsxRuntime from ${JSON.stringify(runtimePath)}`,
					// We can't use `export * from` or else any callsite that uses
					// this module will be compiled to `jsxRuntime.exports.jsx`
					// instead of the more concise `jsx` alias.
					...exports.map(name => `export const ${name} = jsxRuntime.${name}`),
				].join("\n");
			}
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
				babelrc: false,
				configFile: false,
				ast: true,
				root: config.root,
				filename: id,
				parserOpts: {
					sourceType: "module",
					allowAwaitOutsideFunction: true,
					plugins: parserPlugins,
				},
				generatorOpts: {
					decoratorsBeforeExport: true,
				},
				plugins: [
					[
						"@babel/plugin-transform-react-jsx",
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
