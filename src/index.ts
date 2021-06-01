import { Plugin } from "vite";
import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools";
import { hookNamesPlugin } from "./hook-names";

export interface ESBuildConfig {
	jsxFactory: string;
	jsxFragment: string;
	jsxInject?: string;
}

export interface PreactPluginOptions {
	devtoolsInProd?: boolean;
	disableJsxInject?: boolean;
}

export default function preactPlugin({
	devtoolsInProd,
	disableJsxInject,
}: PreactPluginOptions = {}): Plugin[] {
	const esBuildConfig: ESBuildConfig = {
		jsxFactory: "h",
		jsxFragment: "Fragment",
		...(!disableJsxInject
			? {
					jsxInject: `import { h, Fragment } from 'preact'`,
			  }
			: {}),
	};

	return [
		{
			name: "preact:config",
			config() {
				return {
					esbuild: esBuildConfig,
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
