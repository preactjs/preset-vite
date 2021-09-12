import { Plugin } from "vite";
import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools.js";
import { hookNamesPlugin } from "./hook-names.js";

export interface PreactPluginOptions {
	devtoolsInProd?: boolean;
	jsxInject?: string;
}

export default function preactPlugin({
	devtoolsInProd,
	jsxInject,
}: PreactPluginOptions = {}): Plugin[] {
	return [
		{
			name: "preact:config",
			config() {
				return {
					esbuild: {
						jsxFactory: "h",
						jsxFragment: "Fragment",
						jsxInject: jsxInject ?? `import { h, Fragment } from 'preact'`,
					},
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
		preactDevtoolsPlugin({ injectInProd: devtoolsInProd }),
		prefresh(),
		hookNamesPlugin(),
	];
}
