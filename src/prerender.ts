import path from "node:path";
import { promises as fs } from "node:fs";

import MagicString from "magic-string";
import { parse as htmlParse } from "node-html-parser";
import { SourceMapConsumer } from "source-map";
import { codeFrameColumns } from "@babel/code-frame";

import type { Plugin, ResolvedConfig } from "vite";

// Vite re-exports Rollup's type defs in newer versions,
// merge into above type import when we bump the Vite devDep
import type { InputOption, OutputAsset, OutputChunk } from "rollup";

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
	const preloadHelperId = "vite/preload-helper";
	let viteConfig = {} as ResolvedConfig;
	let userEnabledSourceMaps: boolean | undefined;

	renderTarget ||= "body";
	additionalPrerenderRoutes ||= [];

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
		configResolved(config) {
			userEnabledSourceMaps = !!config.build.sourcemap;
			// Enable sourcemaps for generating more actionable error messages
			config.build.sourcemap = true;

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
		// Injects a window check into Vite's preload helper, instantly resolving
		// the module rather than attempting to add a <link> to the document.
		transform(code, id) {
			// Vite keeps changing up the ID, best we can do for cross-version
			// compat is an `includes`
			if (id.includes(preloadHelperId)) {
				// Through v5.0.4
				// https://github.com/vitejs/vite/blob/b93dfe3e08f56cafe2e549efd80285a12a3dc2f0/packages/vite/src/node/plugins/importAnalysisBuild.ts#L95-L98
				const s = new MagicString(code);
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
			}
		},
		async generateBundle(_opts, bundle) {
			// @ts-ignore
			globalThis.location = {};
			// @ts-ignore
			globalThis.self = globalThis;

			// Local, fs-based fetch implementation for prerendering
			const nodeFetch = globalThis.fetch;
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

				return nodeFetch(url, opts);
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
				"headless-prerender",
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
				// Clean up source maps if the user didn't enable them themselves
				if (/\.map$/.test(output) && !userEnabledSourceMaps) {
					delete bundle[output];
					continue;
				}
				if (!/\.js$/.test(output) || bundle[output].type !== "chunk") continue;

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
				const stack = await import("stack-trace").then(({ parse }) =>
					parse(e as Error).find(s => s.getFileName().includes(tmpDir)),
				);

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
						globalThis.location[i] = String(u[i]);
					} catch {}
				}

				const result = await prerender({ ssr: true, url: route.url, route });
				if (result == null) continue;

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
					if (result.html) body = result.html;
					if (result.head) {
						head = result.head;
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
			}
		},
	};
}
