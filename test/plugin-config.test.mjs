import assert from "node:assert";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { dir } from "./util.mjs";

const moduleCache = new Map([
	["@prefresh/vite", () => ({ name: "prefresh" })],
	[
		"./devtools.js",
		{
			preactDevtoolsPlugin: () => ({ name: "preact-devtools" }),
		},
	],
	[
		"./transform-hook-names.js",
		{
			transformHookNamesPlugin: () => ({ name: "transform-hook-names" }),
		},
	],
	[
		"./utils.js",
		{
			createFilter: () => () => true,
			parseId: id => ({ id }),
		},
	],
	["vite-prerender-plugin", { vitePrerenderPlugin: () => [] }],
	["@babel/core", { transformAsync: async () => null }],
	["@babel/plugin-transform-react-jsx", {}],
	["@babel/plugin-transform-react-jsx-development", {}],
	["babel-plugin-transform-hook-names", {}],
]);

let pluginModulePromise;

async function loadPluginModule() {
	pluginModulePromise ||= (async () => {
		const source = await readFile(dir("src/index.ts"), "utf8");
		const { outputText } = ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2019,
				esModuleInterop: true,
			},
			fileName: dir("src/index.ts"),
		});

		const module = { exports: {} };
		const sandbox = {
			module,
			exports: module.exports,
			require(specifier) {
				if (!moduleCache.has(specifier)) {
					throw new Error(`Missing mock for ${specifier}`);
				}

				return moduleCache.get(specifier);
			},
			process,
			console,
			Buffer,
			setTimeout,
			clearTimeout,
		};

		vm.runInNewContext(outputText, sandbox, {
			filename: dir("src/index.ts"),
		});

		return module.exports;
	})();

	return pluginModulePromise;
}

async function getJsxPlugin(options) {
	const pluginModule = await loadPluginModule();
	return pluginModule
		.default(options)
		.find(plugin => plugin.name === "vite:preact-jsx");
}

test("uses oxc config when rolldown is available", async () => {
	const jsxPlugin = await getJsxPlugin({ jsxImportSource: "custom-jsx" });
	const config = jsxPlugin.config.call({ meta: { rolldownVersion: "1.0.0" } });

	assert.ok(config.oxc);
	assert.strictEqual(config.oxc.jsx.runtime, "automatic");
	assert.strictEqual(config.oxc.jsx.importSource, "custom-jsx");
	assert.strictEqual(config.esbuild, undefined);
	assert.ok(config.optimizeDeps.rolldownOptions);
	assert.strictEqual(
		config.optimizeDeps.rolldownOptions.transform.jsx.runtime,
		"automatic",
	);
});

test("falls back to esbuild when rolldown is unavailable", async () => {
	const jsxPlugin = await getJsxPlugin();
	const config = jsxPlugin.config.call({});

	assert.strictEqual(config.oxc, undefined);
	assert.ok(config.esbuild);
	assert.strictEqual(config.esbuild.jsx, "automatic");
	assert.strictEqual(config.esbuild.jsxImportSource, "preact");
	assert.strictEqual(config.optimizeDeps.rolldownOptions, undefined);
});

test("does not enable oxc when babel is configured", async () => {
	const jsxPlugin = await getJsxPlugin({ babel: {} });
	const config = jsxPlugin.config.call({ meta: { rolldownVersion: "1.0.0" } });

	assert.strictEqual(config.oxc, undefined);
	assert.strictEqual(config.esbuild, undefined);
	assert.strictEqual(config.optimizeDeps.rolldownOptions, undefined);
});
