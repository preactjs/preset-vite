import { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { transformSync } from "@babel/core";
// @ts-ignore
import typescript from "@babel/plugin-syntax-typescript";
// @ts-ignore
import jsx from "@babel/plugin-syntax-jsx";
import { babelServerComponents, ServerRegistry } from "./babel/index";
import { IMPORT_SERVER_REG, SERVER_FILE_REG } from "./util";
import debug from "debug";
import * as kl from "kolorist";
import { serverComponentMiddleware } from "./middleware";

export function serverComponentPlugin(): Plugin {
	const log = debug("vite:preact-server-components");

	const FILE = "@preact-server-component";
	const SERVER_URL = "/preact";
	const registry: ServerRegistry = new Map();

	return {
		name: "preact:server-components",

		enforce: "pre",

		resolveId(id) {
			if (id === FILE) {
				return FILE;
			}
		},

		load(id) {
			if (id === FILE) {
				return `import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

export const lazy = (fn) => (props) => {
	const [loaded, set] = useState(null);

	useEffect(() => {
		fn().then(component => set({ component }));
	}, []);

	return loaded ? h(loaded.component, props) : null;
}
				`;
			}
		},

		configureServer(server) {
			server.middlewares.use(
				serverComponentMiddleware({
					endpoint: SERVER_URL,
					registry,
				}),
			);
		},

		transform(code, id) {
			// Check if we are a server component
			if (SERVER_FILE_REG.test(id)) {
				//
			}
			// We're not a server component. Check if we
			// import one. If we do, then we need to mark
			// that boundary via a component
			else if (IMPORT_SERVER_REG.test(code)) {
				log(kl.dim(`transforming ${id}...`));
				const out = transformSync(code, {
					plugins: [
						[typescript, { isTSX: /\.tsx$/.test(id) }],
						[
							babelServerComponents,
							{
								importId: "lazy",
								importSource: FILE,
								serverUrl: SERVER_URL,
								registry,
							},
						],
					],
				});

				if (!out) {
					throw new Error(`Could not compile ${id}`);
				}

				// TODO: Sourcemaps
				return {
					code: out.code!,
					map: out.map,
				};
			}

			return code;
		},
	};
}
