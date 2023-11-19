import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

import MagicString from "magic-string";
import { parse } from "node-html-parser";

import type { Plugin, UserConfig } from "vite";

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
	for (const prop of Object.keys(props).sort()) {
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
	additionalPrerenderRoutes?: string[];
}

export function PrerenderPlugin({
	prerenderScript,
	additionalPrerenderRoutes,
}: PrerenderPluginOptions = {}): Plugin {
	const preloadHelperId = "vite/preload-helper";
	let viteConfig: UserConfig = {};

	additionalPrerenderRoutes ||= [];

	/**
	 * Retrieves the last, non-external script from the entry HTML document to use as
	 * an additional input for Rollup. Hopefully this contains the user's `prerender()`
	 * function.
	 */
	const guessPrerenderScriptFromHTML = async (input: InputOption) => {
		// prettier-ignore
		const entryHtml =
			typeof input === "string"
				? input
				: Array.isArray(input)
					? input.find(i => /html$/.test(i))
					: Object.values(input).find(i => /html$/.test(i));

		if (!entryHtml) throw new Error("Unable to detect entry HTML file.");

		const htmlDoc = parse(await fs.readFile(entryHtml, "utf-8"));
		const scripts = htmlDoc
			.getElementsByTagName("script")
			.map(s => s.getAttribute("src"))
			.filter(src => src && !/^https:/.test(src));

		const entryScript = scripts.reverse()[0];

		if (!entryScript) throw new Error("Unable to detect local entry script");

		return path.join(process.cwd(), viteConfig.root ?? "", entryScript);
	};

	return {
		name: "headless-prerender",
		apply: "build",
		enforce: "post",
		config(config) {
			viteConfig = config;
		},
		async options(opts) {
			if (!opts.input) return;
			if (!prerenderScript) {
				prerenderScript = await guessPrerenderScriptFromHTML(opts.input);
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
			if (id.endsWith(preloadHelperId)) {
				const s = new MagicString(code);
				s.replace(
					`deps.length === 0`,
					`deps.length === 0 || typeof window === 'undefined'`,
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

			// Grab the generated HTML file, which we'll use as a template:
			const tpl = (bundle["index.html"] as OutputAsset).source as string;
			let htmlDoc = parse(tpl);

			// Create a tmp dir to allow importing & consuming the built modules, before
			// Rollup writes them to the disk
			const tmpDir = await fs.mkdtemp(
				path.join(os.tmpdir(), "headless-prerender-"),
			);
			await fs.writeFile(
				path.join(tmpDir, "package.json"),
				JSON.stringify({ type: "module" }),
			);

			let prerenderEntry;
			const outputs = Object.keys(bundle);
			for (const output of outputs) {
				if (!/\.js$/.test(output)) continue;

				await fs.writeFile(
					path.join(tmpDir, path.basename(output)),
					(bundle[output] as OutputChunk).code,
				);

				if ((bundle[output] as OutputChunk).exports?.includes("prerender")) {
					prerenderEntry = bundle[output];
				}
			}

			let head: Head = { lang: "", title: "", elements: new Set() };

			if (!prerenderEntry) {
				this.error("Cannot detect module with `prerender` export");
			}

			const m = await import(
				`file://${path.join(tmpDir, path.basename(prerenderEntry.fileName))}`
			);
			const prerender = m.prerender;

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

				// Update `location` to current URL so routers can use things like location.pathname:
				const u = new URL(route.url, "http://localhost");
				for (let i in u) {
					try {
						// @ts-ignore
						globalThis.location[i] = String(u[i]);
					} catch {}
				}

				const result = await prerender({ ssr: true, url: route.url, route });
				if (result == null) continue;

				// Reset HTML doc & head data
				htmlDoc = parse(tpl);
				head = { lang: "", title: "", elements: new Set() };

				// Add any discovered links to the list of routes to pre-render:
				if (result.links) {
					for (let url of result.links) {
						const parsed = new URL(url, "http://localhost");
						url = parsed.pathname;
						// ignore external links and one's we've already picked up
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
							).join(""),
						);
					}
				}

				// Inject pre-rendered HTML into the start of <body>:
				htmlDoc.querySelector("body")?.insertAdjacentHTML("afterbegin", body);

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
