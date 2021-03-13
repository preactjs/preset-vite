import { NodePath, types } from "@babel/core";
// @ts-ignore
import jsx from "@babel/plugin-syntax-jsx";
import {
	addNamedImport,
	insertAfterImports,
	Plugin,
} from "babel-plugin-helpers";

export interface PluginState {
	imports: Map<string, { source: string; imported: string }>;
	jsxImports: Set<string>;
}

export interface PluginOptions {
	/**
	 * Name of the function to wrap around Server Components.
	 * Default: "lazy"
	 */
	importId?: string;
	/**
	 * Where to import the function that gets wrapped around
	 * Server Components from.
	 * Default: "preact/server-components"
	 */
	importSource?: string;
}

export const babelServerComponents: Plugin<PluginOptions, PluginState> = (
	{ types: t, template },
	{ importId = "lazy", importSource = "preact/server-components" } = {},
) => {
	return {
		name: "preact:server-components",
		inherits: jsx,
		visitor: {
			ImportDeclaration: {
				enter(path, state) {
					const source = path.node.source.value;

					if (/\.server(\.[tj]sx?)?$/.test(source)) {
						let imports = state.get("imports");

						path.node.specifiers.forEach((s, i) => {
							const local = s.local.name;

							if (t.isImportDefaultSpecifier(s)) {
								imports.set(local, { imported: "default", source });
							} else if (t.isImportSpecifier(s)) {
								const { imported } = s;

								if (t.isStringLiteral(imported)) {
									const p = path.get(
										`node.specifiers.${i}.imported`,
									) as NodePath<types.StringLiteral>;
									throw p.buildCodeFrameError(
										`Only node of type "Identifier" is supported here, but got "${p.node.type}".`,
									);
								}

								imports.set(local, { imported: imported.name, source });
							}
						});

						path.remove();
					}
				},
			},

			JSXElement: {
				enter(path, state) {
					const pathName = path.get("openingElement.name") as NodePath<
						types.JSXOpeningElement["name"]
					>;

					if (pathName.isJSXIdentifier()) {
						const name = pathName.node.name;
						const imports = state.get("imports");
						if (!imports.has(name)) return;

						state.get("jsxImports").add(name);
					} else {
						throw path.buildCodeFrameError(
							`Only node of type "JSXIdentifier" is supported for now, but got "${path.node.type}".`,
						);
					}
				},
			},

			Program: {
				enter(path, state) {
					state.set("imports", new Map());
					state.set("jsxImports", new Set());
				},
				exit(path, state) {
					const imports = state.get("imports");

					if (imports.size > 0) {
						const used = state.get("jsxImports");

						const lazyId = addNamedImport(
							t,
							path,
							importId,
							importId,
							importSource,
						);

						imports.forEach((value, local) => {
							if (used.has(local)) {
								const ast = template.ast`
const ${local} = ${lazyId}(() => import("${value.source}").then(m => m.${value.imported}))`;
								insertAfterImports(t, path, ast);
							}
						});
					}
				},
			},
		},
	};
};
