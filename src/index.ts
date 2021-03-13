import { Plugin } from "vite";
import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools";
import { serverComponentPlugin } from "./server-components/vite-plugin";

export interface PreactPluginOptions {
	devtoolsInProd?: boolean;
}

export default function preactPlugin({
	devtoolsInProd,
}: PreactPluginOptions = {}): Plugin[] {
	return [
		{
			name: "preact:config",
			config() {
				return {
					esbuild: {
						jsxFactory: "h",
						jsxFragment: "Fragment",
						jsxInject: `import { h, Fragment } from 'preact'`,
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
		serverComponentPlugin(),
		// preactDevtoolsPlugin({ injectInProd: devtoolsInProd }),
		// prefresh(),
	];
}
