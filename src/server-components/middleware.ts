import { NextHandleFunction } from "connect";
import { h } from "preact";
import debug from "debug";
import fs from "fs";
import { ResolvedConfig, ViteDevServer, build } from "vite";
import * as kl from "kolorist";
import { ServerRegistry } from "./babel";
import { renderToServerProtocol } from "./renderToServerComponent";
import http from "http";

function endError(res: http.ServerResponse, code: number, message: string) {
	res.statusCode = 400;
	res.setHeader("Content-Type", "application/json");
	res.end(
		JSON.stringify({
			code,
			error: message,
		}),
	);
}

function loadFile(fileName: string, extensions: string[]) {
	for (const ext of extensions) {
		try {
			return fs.statSync(`${fileName}.${ext}`);
		} catch (err) {
			console.log(err);
		}
	}
}

export interface MiddlewareOptions {
	endpoint: string;
	registry: ServerRegistry;
	server: ViteDevServer;
	config: ResolvedConfig;
}

export const serverComponentMiddleware = ({
	endpoint,
	registry,
	server,
	config,
}: MiddlewareOptions): NextHandleFunction => {
	const log = debug("vite:preact-server-components");

	return async (req, res, next) => {
		const url = new URL(req.url || "", "relative://");

		// Props are serialized as search params
		const props: Record<string, any> = {};
		url.searchParams.forEach((value, key) => {
			// Basic XSS prevention. Users must verify input
			// themselves.
			// TODO: Warn on props spread in server components
			if (key === "ref" || key === "key" || key === "dangerouslySetInnerHTML") {
				return;
			}

			try {
				props[key] = JSON.parse(value);
			} catch (err) {
				// Must be a string value
				props[key] = value;
			}
		});

		if (url.pathname.startsWith(endpoint)) {
			const root = url.pathname.slice(endpoint.length + 1);

			if (!root) {
				endError(res, 400, `Unknown root "".`);
				return;
			}

			const knownRoot = registry.get(root);
			if (!knownRoot) {
				endError(res, 400, `Unknown root "${root}".`);
				return;
			}

			console.log(url.href, knownRoot);
			// const result = await server.transformRequest(knownRoot.file);

			const fileName = knownRoot.file;
			const code = loadFile(knownRoot.file, ["tsx", "ts", "js", "jsx"]);

			console.log("FOUND", code);
			const r2 = await server.transformWithEsbuild(code, fileName, {
				loader: "ts",
			});

			// const result = await server.(fileName);

			console.log(r2);
			if (result === null || typeof result !== "object") {
				endError(res, 400, `Invalid root "${root}"`);
				return;
			}

			// TODO: Remove eval. We can't use dynamic import
			// statements here as they are transpiled away
			// by vite. This makes me sad :(
			const mod = eval(result.code || "");

			const Component = mod[knownRoot.export];
			console.log("BUDNLED", mod, Component);

			// const Component = await import(knownRoot.file).then(
			// 	mod => mod[knownRoot.export],
			// );
			// console.log(Component);

			log(`[serve] ${kl.dim("render")}`);

			const json = renderToServerProtocol(h("h1", props, "hello from Server!"));

			res.setHeader("Content-Type", "text/plain");
			res.end(`J0: ${JSON.stringify(json)}\n`);

			console.log("SERVER RENDER !!!");
		} else {
			next();
		}
	};
};
