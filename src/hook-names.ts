import { transformAsync } from "@babel/core";
import { Plugin, ResolvedConfig } from "vite";

export function hookNamesPlugin(): Plugin {
	let config: ResolvedConfig;

	return {
		name: "preact:hook-names",
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		async transform(code, id) {
			if (config.isProduction) {
				return;
			}

			if (!/\.[tj]sx$/.test(id)) {
				return;
			}

			const res = await transformAsync(code, {
				plugins: ["babel-plugin-transform-hook-names"],
				filename: id,
				sourceMaps: true,
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
