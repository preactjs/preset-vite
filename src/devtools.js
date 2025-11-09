import { normalizePath } from "vite";
import path from "path";
import debug from "debug";
import pc from "picocolors";

import { parseId } from "./utils.js";

/**
 * @typedef {import('vite').Plugin} Plugin
 * @typedef {import('vite').ResolvedConfig} ResolvedConfig
 *
 * @typedef {import('./index.d.ts').PreactDevtoolsPluginOptions} PreactDevtoolsPluginOptions
 */

/**
 * @param {PreactDevtoolsPluginOptions} options
 * @returns {Plugin}
 */
export function preactDevtoolsPlugin({ devToolsEnabled, shouldTransform }) {
	const log = debug("vite:preact-devtools");

	let entry = "";
	/** @type {ResolvedConfig} */
	let config;
	let found = false;

	/** @type {Plugin} */
	const plugin = {
		name: "preact:devtools",

		// Ensure that we resolve before everything else
		enforce: "pre",

		config() {
			return {
				optimizeDeps: {
					include: ["preact/debug", "preact/devtools"],
				},
			};
		},

		configResolved(resolvedConfig) {
			config = resolvedConfig;
			devToolsEnabled = devToolsEnabled ?? !config.isProduction;
		},

		resolveId(url, importer = "") {
			const { id } = parseId(url);

			// Get the main entry file to inject into
			if (!found && /\.html$/.test(importer) && shouldTransform(id)) {
				found = true;

				entry = normalizePath(path.join(config.root, id));

				// TODO: Vite types require explicit return
				// undefined here. They're lacking the "void" type
				// in their declarations
				return undefined;
			}
		},

		transform(code, url) {
			const { id } = parseId(url);

			if (entry === id && (!config.isProduction || devToolsEnabled)) {
				const source = config.isProduction ? "preact/devtools" : "preact/debug";
				code = `import "${source}";\n${code}`;

				log(`[inject] ${pc.cyan(source)} -> ${pc.dim(id)}`);
				return code;
			}
		},
	};

	return plugin;
}
