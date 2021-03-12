import { mergeConfig, UserConfig } from "vite";
import prefresh from "@prefresh/vite";
import { preactDevtoolsPlugin } from "./devtools";

export interface PreactPluginOptions {
	devtoolsInProd?: boolean;
}

export default function withPreact(
	config: UserConfig,
	{ devtoolsInProd }: PreactPluginOptions = {},
): UserConfig {
	const preactConfig: UserConfig = {
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
		plugins: [
			preactDevtoolsPlugin({ injectInProd: devtoolsInProd }),
			prefresh(),
		],
	};

	return mergeConfig(config, preactConfig);
}
