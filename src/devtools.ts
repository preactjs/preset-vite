import { Plugin, ResolvedConfig } from "vite";
import path from "path";

export interface PreactDevtoolsPluginOptions {
	injectInProd?: boolean;
}
export function preactDevtoolsPlugin({
	injectInProd = false,
}: PreactDevtoolsPluginOptions = {}): Plugin {
	let entry = "";
	let config: ResolvedConfig;

	const plugin: Plugin = {
		name: "preact:devtools",

		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},

		transformIndexHtml(html) {
			// Use this to grab the initial entry js file to
			// inject "preact/debug" into at a later stage.
			const match = html.match(/<script type=["]module["] src=["](.*?)["]/);

			if (!match || !match.length) {
				throw new Error(`Didn't find entry script tag in index.html`);
			}

			entry = path.join(config.root, match[1]);
			return html;
		},

		transform(code, id) {
			// Inject "preact/debug" or "preact/devtools" respectively
			if ((entry === id && config.command === "serve") || injectInProd) {
				const source = injectInProd ? "preact/devtools" : "preact/debug";
				code = `import "${source}";\n${code}`;
			}

			return code;
		},
	};

	return plugin;
}
