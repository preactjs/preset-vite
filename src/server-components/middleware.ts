import { NextHandleFunction } from "connect";
import { h } from "preact";
import debug from "debug";
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

export interface MiddlewareOptions {
	endpoint: string;
	registry: ServerRegistry;
}

export const serverComponentMiddleware = ({
	endpoint,
	registry,
}: MiddlewareOptions): NextHandleFunction => {
	const log = debug("vite:preact-server-components");

	return (req, res, next) => {
		// TODO: Why do we need an origin here?
		const url = new URL(req.url || "", `http://localhost:3000`);

		if (url.pathname === endpoint) {
			const root = url.searchParams.get("root");

			if (!root) {
				endError(res, 400, `Missing "root" search parameter in URL`);
				return;
			}

			const knownRoot = registry.get(root);
			if (!knownRoot) {
				endError(res, 400, `Unknown root "${root}".`);
				return;
			}

			log(`[serve] ${kl.dim("render")}`);

			const json = renderToServerProtocol(h("h1", null, "hello from Server!"));

			res.setHeader("Content-Type", "text/plain");
			res.end(`J0: ${JSON.stringify(json)}\n`);

			console.log("SERVER RENDER !!!");
		} else {
			next();
		}
	};
};
