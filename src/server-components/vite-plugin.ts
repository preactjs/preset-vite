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

	// const FILE = "@preact-server-component";
	const FILE = "preact/server-components";
	const ENDPOINT = "/preact-server/resources";
	const ENDPOINT_RENDER = "/preact-server/render";
	const registry: ServerRegistry = new Map();
	let config: ResolvedConfig;

	return {
		name: "preact:server-components",

		enforce: "pre",

		// resolveId(id) {
		// 	if (id === FILE) {
		// 		return FILE;
		// 	}
		// },

		// TODO: This is only for demo purposes
		config() {
			const sc = path.join(
				__dirname,
				"..",
				"src",
				"server-components",
				"ServerRoot",
			);
			return {
				resolve: {
					alias: {
						[FILE]: sc,
					},
				},
			};
		},

		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},

		configureServer(server) {
			server.middlewares.use(
				serverComponentMiddleware({
					renderUrl: ENDPOINT_RENDER,
					resourceUrl: ENDPOINT,
					registry,
					server,
					config,
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
					filename: id,
					plugins: [
						[typescript, { isTSX: /\.tsx$/.test(id) }],
						[
							babelServerComponents,
							{
								importSource: FILE,
								serverUrl: ENDPOINT_RENDER,
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
