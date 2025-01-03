import path from "node:path";
import { promises as fs } from "node:fs";

import MagicString from "magic-string";
import { parse as htmlParse } from "node-html-parser";
import { SourceMapConsumer } from "source-map";
import { codeFrameColumns } from "@babel/code-frame";

import type { Plugin, ResolvedConfig } from "vite";

// Vite re-exports Rollup's type defs in newer versions,
// merge into above type import when we bump the Vite devDep
import type {
	InputOption,
	OutputAsset,
	OutputChunk,
	OutputOptions,
} from "rollup";

interface HeadElement {
	type: string;
	props: Record<string, string>;
	children?: string;
}

interface Head {
	lang: string;
	title: string;
	elements: Set<HeadElement>;
}

interface PrerenderedRoute {
	url: string;
	_discoveredBy?: PrerenderedRoute;
}

function enc(str: string) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function serializeElement(
	element: HeadElement | HeadElement[] | string,
): string {
	if (element == null) return "";
	if (typeof element !== "object") return String(element);
	if (Array.isArray(element)) return element.map(serializeElement).join("");
	const type = element.type;
	let s = `<${type}`;
	const props = element.props || {};
	let children = element.children;
	for (const prop of Object.keys(props)) {
		const value = props[prop];
		// Filter out empty values:
		if (value == null) continue;
		if (prop === "children" || prop === "textContent") children = value;
		else s += ` ${prop}="${enc(value)}"`;
	}
	s += ">";
	if (!/link|meta|base/.test(type)) {
		if (children) s += serializeElement(children);
		s += `</${type}>`;
	}
	return s;
}

interface PrerenderPluginOptions {
	prerenderScript?: string;
	renderTarget?: string;
	additionalPrerenderRoutes?: string[];
}

export function PrerenderPlugin({
	prerenderScript,
	renderTarget,
	additionalPrerenderRoutes,
}: PrerenderPluginOptions = {}): Plugin {
	let viteConfig = {} as ResolvedConfig;
	let userEnabledSourceMaps: boolean | undefined;

	renderTarget ||= "body";
	additionalPrerenderRoutes ||= [];

	const preloadHelperId = "vite/preload-helper";
	const preloadPolyfillId = "vite/modulepreload-polyfill";
	// PNPM, Yalc, and anything else utilizing symlinks mangle the file
	// path a bit so we need a minimal, fairly unique ID to check against
	const tmpDirId = "headless-prerender";

	/**
	 * From the non-external scripts in entry HTML document, find the one (if any)
	 * that provides a `prerender` export
	 */
	const getPrerenderScriptFromHTML = async (input: InputOption) => {
		// prettier-ignore
		const entryHtml =
			typeof input === "string"
				? input
				: Array.isArray(input)
					? input.find(i => /html$/.test(i))
					: Object.values(input).find(i => /html$/.test(i));

		if (!entryHtml) throw new Error("Unable to detect entry HTML");

		const htmlDoc = htmlParse(await fs.readFile(entryHtml, "utf-8"));

		const entryScriptTag = htmlDoc
			.getElementsByTagName("script")
			.find(s => s.hasAttribute("prerender"));

		if (!entryScriptTag)
			throw new Error("Unable to detect prerender entry script");

		const entrySrc = entryScriptTag.getAttribute("src");
		if (!entrySrc || /^https:/.test(entrySrc))
			throw new Error(
				"Prerender entry script must have a `src` attribute and be local",
			);

		return path.join(viteConfig.root, entrySrc);
	};

	return {
		name: "preact:prerender",
		apply: "build",
		enforce: "post",
		// As of Vite 6, `sourcemap` can *only* be set in `config` and
		// `manualChunks` can *only* be set in `configResolved`.
		config(config) {
			userEnabledSourceMaps = !!config.build?.sourcemap;

			// Enable sourcemaps for generating more actionable error messages
			config.build ??= {};
			config.build.sourcemap = true;
		},
		configResolved(config) {
			// With this plugin adding an additional input, Rollup/Vite tries to be smart
			// and extract our prerender script (which is often their main bundle) to a separate
			// chunk that the entry & prerender chunks can depend on. Unfortunately, this means the
			// first script the browser loads is the module preload polyfill & a sync import of the main
			// bundle. This is obviously less than ideal as the main bundle should be directly referenced
			// by the user's HTML to speed up loading a bit.

			// We're only going to alter the chunking behavior in the default cases, where the user and/or
			// other plugins haven't already configured this. It'd be impossible to avoid breakages otherwise.
			if (
				Array.isArray(config.build.rollupOptions.output) ||
				(config.build.rollupOptions.output as OutputOptions)?.manualChunks
			) {
				return;
			}

			config.build.rollupOptions.output ??= {};
			(config.build.rollupOptions.output as OutputOptions).manualChunks = (
				id: string,
			) => {
				if (
					id.includes(prerenderScript as string) ||
					id.includes(preloadPolyfillId)
				) {
					return "index";
				}
			};

			viteConfig = config;
		},
		async options(opts) {
			if (!opts.input) return;
			if (!prerenderScript) {
				prerenderScript = await getPrerenderScriptFromHTML(opts.input);
			}

			// prettier-ignore
			opts.input =
				typeof opts.input === "string"
					? [opts.input, prerenderScript]
					: Array.isArray(opts.input)
						? [...opts.input, prerenderScript]
						: { ...opts.input, prerenderEntry: prerenderScript };
			opts.preserveEntrySignatures = "allow-extension";
		},
		// Injects window checks into Vite's preload helper & modulepreload polyfill
		transform(code, id) {
			if (id.includes(preloadHelperId)) {
				// Injects a window check into Vite's preload helper, instantly resolving
				// the module rather than attempting to add a <link> to the document.
				const s = new MagicString(code);

				// Through v5.0.4
				// https://github.com/vitejs/vite/blob/b93dfe3e08f56cafe2e549efd80285a12a3dc2f0/packages/vite/src/node/plugins/importAnalysisBuild.ts#L95-L98
				s.replace(
					`if (!__VITE_IS_MODERN__ || !deps || deps.length === 0) {`,
					`if (!__VITE_IS_MODERN__ || !deps || deps.length === 0 || typeof window === 'undefined') {`,
				);
				// 5.0.5+
				// https://github.com/vitejs/vite/blob/c902545476a4e7ba044c35b568e73683758178a3/packages/vite/src/node/plugins/importAnalysisBuild.ts#L93
				s.replace(
					`if (__VITE_IS_MODERN__ && deps && deps.length > 0) {`,
					`if (__VITE_IS_MODERN__ && deps && deps.length > 0 && typeof window !== 'undefined') {`,
				);
				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			} else if (id.includes(preloadPolyfillId)) {
				const s = new MagicString(code);
				// Replacement for `'link'` && `"link"` as the output from their tooling has
				// differed over the years. Should be better than switching to regex.
				// https://github.com/vitejs/vite/blob/20fdf210ee0ac0824b2db74876527cb7f378a9e8/packages/vite/src/node/plugins/modulePreloadPolyfill.ts#L62
				s.replace(
					`const relList = document.createElement('link').relList;`,
					`if (typeof window === "undefined") return;\n  const relList = document.createElement('link').relList;`,
				);
				s.replace(
					`const relList = document.createElement("link").relList;`,
					`if (typeof window === "undefined") return;\n  const relList = document.createElement("link").relList;`,
				);
				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			}
		},
		async generateBundle(_opts, bundle) {
			// @ts-ignore
			globalThis.location = {};
			// @ts-ignore
			globalThis.self = globalThis;

			// As of Vite 5.3.0-beta.0, Vite injects an undefined `__VITE_PRELOAD__` var
			// Swapping in an empty array is fine as we have no need to preload whilst prerendering
			// https://github.com/vitejs/vite/pull/16562
			// @ts-ignore
			globalThis.__VITE_PRELOAD__ = [];

			// Local, fs-based fetch implementation for prerendering
			// @ts-ignore
			globalThis.unpatchedFetch = globalThis.fetch;
			// @ts-ignore
			globalThis.fetch = async (url: string, opts: RequestInit | undefined) => {
				if (/^\//.test(url)) {
					try {
						return new Response(
							await fs.readFile(
								`${path.join(
									viteConfig.root,
									viteConfig.build.outDir,
								)}/${url.replace(/^\//, "")}`,
								"utf-8",
							),
						);
					} catch (e: any) {
						if (e.code !== "ENOENT") throw e;
						return new Response(null, { status: 404 });
					}
				}

				// @ts-ignore
				return globalThis.unpatchedFetch(url, opts);
			};

			// Grab the generated HTML file, which we'll use as a template:
			const tpl = (bundle["index.html"] as OutputAsset).source as string;
			let htmlDoc = htmlParse(tpl);

			// Create a tmp dir to allow importing & consuming the built modules,
			// before Rollup writes them to the disk
			const tmpDir = path.join(
				viteConfig.root,
				"node_modules",
				"@preact/preset-vite",
				tmpDirId,
			);
			try {
				await fs.rm(tmpDir, { recursive: true });
			} catch (e: any) {
				if (e.code !== "ENOENT") throw e;
			}
			await fs.mkdir(tmpDir, { recursive: true });

			await fs.writeFile(
				path.join(tmpDir, "package.json"),
				JSON.stringify({ type: "module" }),
			);

			let prerenderEntry: OutputChunk | undefined;
			for (const output of Object.keys(bundle)) {
				if (!output.endsWith(".js") || bundle[output].type !== "chunk")
					continue;

				await fs.writeFile(
					path.join(tmpDir, path.basename(output)),
					(bundle[output] as OutputChunk).code,
				);

				if ((bundle[output] as OutputChunk).exports?.includes("prerender")) {
					prerenderEntry = bundle[output] as OutputChunk;
				}
			}
			if (!prerenderEntry) {
				this.error("Cannot detect module with `prerender` export");
			}

			let head: Head = { lang: "", title: "", elements: new Set() };

			let prerender;
			try {
				const m = await import(
					`file://${path.join(tmpDir, path.basename(prerenderEntry!.fileName))}`
				);
				prerender = m.prerender;
			} catch (e) {
				const isReferenceError = e instanceof ReferenceError;
				let message = `\n
					${e}

					This ${
						isReferenceError ? "is most likely" : "could be"
					} caused by using DOM/Web APIs which are not available
					available to the prerendering process running in Node. Consider
					wrapping the offending code in a window check like so:

					if (typeof window !== "undefined") {
						// do something in browsers only
					}
				`.replace(/^\t{5}/gm, "");

				const stack = await import("stack-trace").then(({ parse }) =>
					parse(e as Error).find(s => s.getFileName().includes(tmpDirId)),
				);

				const sourceMapContent = prerenderEntry.map;
				if (stack && sourceMapContent) {
					await SourceMapConsumer.with(
						sourceMapContent,
						null,
						async consumer => {
							let { source, line, column } = consumer.originalPositionFor({
								line: stack.getLineNumber(),
								column: stack.getColumnNumber(),
							});

							if (!source || line == null || column == null) {
								message += `\nUnable to locate source map for error!\n`;
								this.error(message);
							}

							// `source-map` returns 0-indexed column numbers
							column += 1;

							const sourcePath = path.join(
								viteConfig.root,
								source.replace(/^(..\/)*/, ""),
							);
							const sourceContent = await fs.readFile(sourcePath, "utf-8");

							const frame = codeFrameColumns(sourceContent, {
								start: { line, column },
							});
							message += `
							> ${sourcePath}:${line}:${column}\n
							${frame}
						`.replace(/^\t{7}/gm, "");
						},
					);
				}

				this.error(message);
			}

			if (typeof prerender !== "function") {
				this.error("Detected `prerender` export, but it is not a function");
			}

			// We start by pre-rendering the home page.
			// Links discovered during pre-rendering get pushed into the list of routes.
			const seen = new Set(["/", ...additionalPrerenderRoutes!]);

			let routes: PrerenderedRoute[] = [...seen].map(link => ({ url: link }));

			for (const route of routes) {
				if (!route.url) continue;

				const outDir = route.url.replace(/(^\/|\/$)/g, "");
				const assetName = path.join(
					outDir,
					outDir.endsWith(".html") ? "" : "index.html",
				);

				// Update `location` to current URL so routers can use things like `location.pathname`
				const u = new URL(route.url, "http://localhost");
				for (const i in u) {
					try {
						// @ts-ignore
						globalThis.location[i] =
							i === "toString"
								? u[i].bind(u)
								: // @ts-ignore
								  String(u[i]);
					} catch {}
				}

				const result = await prerender({ ssr: true, url: route.url, route });
				if (result == null) {
					this.warn(`No result returned for route "${route.url}"`);
					continue;
				}

				// Reset HTML doc & head data
				htmlDoc = htmlParse(tpl);
				head = { lang: "", title: "", elements: new Set() };

				// Add any discovered links to the list of routes to pre-render:
				if (result.links) {
					for (let url of result.links) {
						const parsed = new URL(url, "http://localhost");
						url = parsed.pathname.replace(/\/$/, "") || "/";
						// ignore external links and ones we've already picked up
						if (seen.has(url) || parsed.origin !== "http://localhost") continue;
						seen.add(url);
						routes.push({ url, _discoveredBy: route });
					}
				}

				let body;
				if (result && typeof result === "object") {
					if (typeof result.html !== "undefined") body = result.html;
					if (result.head) {
						head = result.head;
					}
					if (result.data) {
						body += `<script type="application/json" id="preact-prerender-data">${JSON.stringify(
							result.data,
						)}</script>`;
					}
				} else {
					body = result;
				}

				const htmlHead = htmlDoc.querySelector("head");
				if (htmlHead) {
					if (head.title) {
						const htmlTitle = htmlHead.querySelector("title");
						htmlTitle
							? htmlTitle.set_content(enc(head.title))
							: htmlHead.insertAdjacentHTML(
									"afterbegin",
									`<title>${enc(head.title)}</title>`,
							  );
					}

					if (head.lang) {
						htmlDoc.querySelector("html")!.setAttribute("lang", enc(head.lang));
					}

					if (head.elements) {
						// Inject HTML links at the end of <head> for any stylesheets injected during rendering of the page:
						htmlHead.insertAdjacentHTML(
							"beforeend",
							Array.from(
								new Set(Array.from(head.elements).map(serializeElement)),
							).join("\n"),
						);
					}
				}

				const target = htmlDoc.querySelector(renderTarget!);
				if (!target)
					this.error(
						result.renderTarget == "body"
							? "`renderTarget` was not specified in plugin options and <body> does not exist in input HTML template"
							: `Unable to detect prerender renderTarget "${result.selector}" in input HTML template`,
					);
				target.insertAdjacentHTML("afterbegin", body);

				// Add generated HTML to compilation:
				if (route.url === "/")
					(bundle["index.html"] as OutputAsset).source = htmlDoc.toString();
				else
					this.emitFile({
						type: "asset",
						fileName: assetName,
						source: htmlDoc.toString(),
					});

				// Clean up source maps if the user didn't enable them themselves
				if (!userEnabledSourceMaps) {
					for (const output of Object.keys(bundle)) {
						if (output.endsWith(".map")) {
							delete bundle[output];
							continue;
						}
						if (output.endsWith(".js")) {
							const codeOrSource =
								bundle[output].type == "chunk" ? "code" : "source";
							// @ts-ignore
							bundle[output][codeOrSource] = bundle[output][
								codeOrSource
							].replace(/\n\/\/#\ssourceMappingURL=.*/, "");
						}
					}
				}
			}
		},
	};
}

interface HTMLRoutingMiddlewareOptions {
	fallback?: string;
}

/**
 * Vite's preview server won't route to anything but `/index.html` without
 * a file extension, e.g., `/tutorial` won't serve `/tutorial/index.html`.
 * This leads to some surprises & hydration issues, so we'll fix it ourselves.
 */
export function HTMLRoutingMiddlewarePlugin({
	fallback,
}: HTMLRoutingMiddlewareOptions = {}): Plugin {
	let outDir: string;

	return {
		name: "serve-prerendered-html",
		configResolved(config) {
			outDir = path.resolve(config.root, config.build.outDir);
		},
		configurePreviewServer(server) {
			server.middlewares.use(async (req, _res, next) => {
				if (!req.url) return next();

				const url = new URL(req.url, `http://${req.headers.host}`);
				// If URL has a file extension, bail
				if (url.pathname != url.pathname.split(".").pop()) return next();

				const file = path.join(
					outDir,
					url.pathname.split(path.posix.sep).join(path.sep),
					"index.html",
				);

				try {
					await fs.access(file);
					req.url = url.pathname + "/index.html" + url.search;
				} catch {
					req.url = (fallback || "") + "/index.html";
				}

				return next();
			});
		},
	};
}
