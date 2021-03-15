import { Plugin, ResolvedConfig } from "vite";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
	const ENDPOINT = "/preact";
	const registry: ServerRegistry = new Map();
	let config: ResolvedConfig;

	return {
		name: "preact:server-components",

		enforce: "pre",

		resolveId(id) {
			if (id === FILE) {
				return FILE;
			}
		},

		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},

		configureServer(server) {
			server.middlewares.use(
				serverComponentMiddleware({
					endpoint: ENDPOINT,
					registry,
					server,
				}),
			);
		},

		load(id) {
			if (id === FILE) {
				return `import { h, Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";

export const fromServer = (name) => {
	const ServerComponent = (props) => {
		const [loaded, set] = useState(null);

		// Track current 
		const revision = useRef(0);

		useEffect(() => {
			const current = revision.current++;

			const params = new URLSearchParams();
			Object.keys(props).forEach(key => {
				if (key === "key" || key === "ref") return;

				const value = JSON.stringify(props[key]);
				params.append(key, encodeURIComponent(value))
			});

			const url = \`${ENDPOINT}/\${name}\${params.toString()}\`
			fetch(url)
				.then(res => res.text())
				.then(r => {
					// Abort if a new request was initiated before
					// we finished processing the current one.
					if (revision.current !== current) {
						return;
					}

					console.log(r)
				})
		}, [name, props]);

		return loaded ? h(loaded.component, props) : null
	}

	ServerComponent.displayName = 'ServerComponent'
	return ServerComponent;
}
				`;
			}
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
					filename: id,
					plugins: [
						[typescript, { isTSX: /\.tsx$/.test(id) }],
						[
							babelServerComponents,
							{
								importSource: FILE,
								serverUrl: ENDPOINT,
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
