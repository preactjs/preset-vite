import { NextHandleFunction } from "connect";
import { jsx } from "preact/jsx-runtime";
import debug from "debug";
import path from "path";
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

export interface MiddlewareOptions {
	renderUrl: string;
	resourceUrl: string;
	registry: ServerRegistry;
	server: ViteDevServer;
	config: ResolvedConfig;
}

export const serverComponentMiddleware = ({
	renderUrl,
	resourceUrl,
	registry,
	server,
	config,
}: MiddlewareOptions): NextHandleFunction => {
	const log = debug("vite:preact-server-components");
	// TODO: Where to put this?
	const cacheDir = path.join(config.root, ".preact");

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

		if (url.pathname.startsWith(resourceUrl)) {
			const root = url.pathname.slice(
				resourceUrl.length + 1,
				url.pathname.lastIndexOf("."),
			);

			const entry = registry.get(root);
			if (!entry) {
				console.log(root, registry);
				throw new Error("fail");
			}

			const result2 = await server.transformRequest(entry.file);

			if (typeof result2 !== "object" || result2 === null) {
				throw new Error("Fail2");
			}

			try {
				res.setHeader("Content-Type", "text/javascript");
				res.end(result2.code || "");
				return;
			} catch (err) {
				endError(res, 400, `Unknown resource "${root}"`);
				return;
			}
		} else if (url.pathname.startsWith(renderUrl)) {
			const root = url.pathname.slice(renderUrl.length + 1);

			if (!root) {
				endError(res, 400, `Unknown root "".`);
				return;
			}

			const knownRoot = registry.get(root);
			if (!knownRoot) {
				endError(res, 400, `Unknown root "${root}".`);
				return;
			}

			const fileName = knownRoot.file;

			let raw = (config.esbuild! || {}).jsxInject + "\n";
			raw += fs.readFileSync(fileName, "utf-8");

			const result = await server.transformWithEsbuild(raw, fileName, {
				...config.esbuild,
				loader: "tsx",
				target: "es2019",
				format: "cjs",
			});

			const name = `${root}.js`;
			const file = path.join(cacheDir, name);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, result.code, "utf-8");
			fs.writeFileSync(`${file}.map`, result.map.toString(), "utf-8");

			// const result = await server.(fileName);

			if (result === null || typeof result !== "object") {
				endError(res, 400, `Invalid root "${root}"`);
				return;
			}

			const mod = await import(file);
			const Component = mod[knownRoot.export];

			log(`[serve] ${kl.dim("render")}`);

			const json = renderToServerProtocol(
				jsx(Component, { ...props, children: "hello from Server!" }),
			);

			console.log({ resourceUrl, name });
			const loadUrl = `${resourceUrl}/${name}`;

			res.setHeader("Content-Type", "text/plain");
			res.end(
				// prettier-ignore
				`M0: ${JSON.stringify({id: loadUrl, exports: Object.keys(mod) })}\n`+
				`J0: ${JSON.stringify(json)}\n`,
			);

			console.log("SERVER RENDER !!!");
		} else {
			next();
		}
	};
};
