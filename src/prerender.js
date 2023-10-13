import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import MagicString from "magic-string";
import { parse } from "node-html-parser";

function enc(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/**
 * @param {object} [options]
 * @param {string} [options.prerenderScript=index] - Path to the script that exports a `prerender` function
 * @returns {import('vite').Plugin}
 */
export function HeadlessPrerenderPlugin({ prerenderScript } = {}) {
	const preloadHelperId = "\0vite/preload-helper";

	prerenderScript = prerenderScript ?? "index";

	/**
	 * @param {import('vite').Rollup.InputOptions} opts
	 */
	const getEntryScript = async opts => {
		const entryHtml =
			typeof opts.input === "string"
				? opts.input
				: Array.isArray(opts.input)
				? opts.input.find(i => /html$/.test(i))
				: Object.values(opts.input).find(i => /html$/.test(i));

		const htmlDoc = parse(await fs.readFile(entryHtml, "utf-8"));

		const scripts = htmlDoc
			.getElementsByTagName("script")
			.map(s => s.getAttribute("src"))
			.filter(src => !/^https:/.test(src));

		const entryScript = scripts.find(src => {
			if (prerenderScript === "index") {
				if (/index\.[tj]sx?$/.test(src)) return true;
			} else if (src.endsWith(prerenderScript)) return true;
			return false;
		});

		if (!entryScript) {
			throw new Error(`Unable to detect entrypoint in your index.html.`);
		}

		return path.join(process.cwd(), entryScript);
	};

	return {
		name: "headless-prerender",
		apply: "build",
		enforce: "post",
		async options(opts) {
			const entryScript = await getEntryScript(opts);

			opts.input =
				typeof opts.input === "string"
					? [opts.input, entryScript]
					: Array.isArray(opts.input)
					? [...opts.input, entryScript]
					: { ...opts.input, prerenderEntry: entryScript };
			opts.preserveEntrySignatures = "allow-extension";
		},
		transform(code, id) {
			// Injects a window check into Vite's preload helper, instantly resolving
			// the module rather than attempting to add a <link> to the document.
			//
			// TODO: See if we can make this less brittle
			if (id === preloadHelperId) {
				const s = new MagicString(code);
				s.replace(
					`const links = document.getElementsByTagName('link');`,
					`if (typeof window === 'undefined') return new Promise(r => r()).then(() => baseModule());
                         const links = document.getElementsByTagName('link');`,
				);
				return {
					code: s.toString(),
					map: s.generateMap({ hires: true }),
				};
			}
		},
		async generateBundle(_opts, bundle) {
			globalThis.location = /** @type {object} */ ({});
			globalThis.self = /** @type {any} */ (globalThis);

			// Grab the generated HTML file, which we'll use as a template:
			const tpl = bundle["index.html"].source;
			let htmlDoc = parse(tpl);

			const tmpDir = await fs.mkdtemp(
				path.join(os.tmpdir(), "headless-prerender-"),
			);
			await fs.writeFile(
				path.join(tmpDir, "package.json"),
				JSON.stringify({ type: "module" }),
			);

			let entryScript;
			const outputs = Object.keys(bundle);
			for (const output of outputs) {
				if (!/\.js$/.test(output)) continue;

				await fs.writeFile(
					path.join(tmpDir, path.basename(output)),
					bundle[output].code,
				);

				if (bundle[output].exports?.includes("prerender")) {
					entryScript = bundle[output];
					break;
				}
			}

			/** @typedef {{ type: string, props: Record<string, string>, children?: string } | string | null} HeadElement */

			/**
			 * @type {{ lang: string, title: string, elements: Set<HeadElement>}}
			 */
			let head = { lang: "", title: "", elements: new Set() };

			const m = await import(
				`file://${path.join(tmpDir, path.basename(entryScript.fileName))}`
			);
			const prerender = m.prerender;

			if (typeof prerender !== "function") {
				// TODO: Figure out better error message / handling here
				console.log("Detected `prerender` export, but it is not a function.");
			}

			/**
			 * @param {HeadElement|HeadElement[]|Set<HeadElement>} element
			 * @returns {string} html
			 */
			function serializeElement(element) {
				if (element == null) return "";
				if (typeof element !== "object") return String(element);
				if (Array.isArray(element))
					return element.map(serializeElement).join("");
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

			// We start by pre-rendering the home page.
			// Links discovered during pre-rendering get pushed into the list of routes.
			const seen = new Set(["/"]);

			/** @typedef {{ url: string, _discoveredBy?: PrerenderedRoute }} PrerenderedRoute */
			/** @type {PrerenderedRoute[]} */
			let routes = [...seen].map(link => ({ url: link }));

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
					htmlDoc.querySelector("html").setAttribute("lang", enc(head.lang));
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

				// Inject pre-rendered HTML into the start of <body>:
				htmlDoc.querySelector("body").insertAdjacentHTML("afterbegin", body);

				// Add generated HTML to compilation:
				if (route.url === "/") bundle["index.html"].source = htmlDoc.toString();
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
