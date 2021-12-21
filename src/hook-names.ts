import { transformAsync } from "@babel/core";
import { Plugin, ResolvedConfig } from "vite";
import type { RollupFilter } from "./utils.js";
import { parseId } from "./utils.js";

export interface PreactHookNamesPluginOptions {
	shouldTransform: RollupFilter;
}

export function hookNamesPlugin({
	shouldTransform,
}: PreactHookNamesPluginOptions): Plugin {
	let config: ResolvedConfig;

	return {
		name: "preact:hook-names",
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		async transform(code, url) {
			if (config.isProduction) {
				return;
			}

			const { id } = parseId(url);

			if (!shouldTransform(id)) {
				return;
			}

			const res = await transformAsync(code, {
				plugins: ["babel-plugin-transform-hook-names"],
				filename: id,
				sourceMaps: true,
				configFile: false,
				babelrc: false,
				ast: false,
			});

			// TODO: When does this happen? The babel documentation isn't
			// clear about this.
			if (res === null) {
				return;
			}

			return {
				code: res.code || code,
				map: res.map,
			};
		},
	};
}
