import { Plugin, FilterPattern, createFilter } from "vite";
import type { ParserOptions } from "@babel/parser";
import type { TransformOptions } from "@babel/core";

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
	 * Whether to use Preact devtools
	 * @default !isProduction
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

export interface PreactDevtoolsPluginOptions {
	devToolsEnabled?: boolean;
	shouldTransform: ReturnType<typeof createFilter>;
}

declare function preactPlugin(options?: PreactPluginOptions): Plugin[];

export default preactPlugin;
export { preactPlugin as preact };
