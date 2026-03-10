import { extractAssignedNames } from "@rollup/pluginutils";
import MagicString from "magic-string";
import { walk } from "zimmerframe";

import { parseId } from "./utils.js";

/** @import { Plugin } from "vite" */
/** @import { Node, Program } from "estree" */

/** @import { TransformHookNamesPluginOptions, NodeWithRange } from "./index.d.ts"; */

const HOOK_IMPORTS = new Set(["preact/hooks", "preact/compat", "react"]);
const HOOK_NAME_RE = /^(useState|useReducer|useRef|useMemo)$/;
const FILTER_CODE_RE = /\buse(?:State|Reducer|Ref|Memo)\b/;

/**
 * @param {TransformHookNamesPluginOptions} options
 * @returns {Plugin}
 */
export function transformHookNamesPlugin({ devToolsEnabled, shouldTransform }) {
	return {
		name: "preact:transform-hook-names",
		configResolved(config) {
			devToolsEnabled = devToolsEnabled ?? !config.isProduction;
		},
		transform(code, url) {
			if (!devToolsEnabled) return;

			const { id } = parseId(url);
			if (!shouldTransform(id)) return;
			if (!FILTER_CODE_RE.test(code)) return;

			/** @type {NodeWithRange<Program>} */
			let ast;
			try {
				ast = /** @type {NodeWithRange<Program>} */ (this.parse(code));
			} catch {
				return;
			}

			const importedHooks = getImportedHooks(ast);
			if (importedHooks.size === 0) return;

			const s = new MagicString(code);
			let hasHelper = false;

			const typedWalk = /** @type {typeof walk<NodeWithRange, null>} */ (walk);
			typedWalk(ast, null, {
				CallExpression(node, { path, next }) {
					const callee = node.callee;
					if (callee.type !== "Identifier") {
						next();
						return;
					}

					const hookName = callee.name;
					// the hook name might be shadowed by a local variable,
					// but that false-positive is fine
					// since `addHookName` is transparent
					if (!HOOK_NAME_RE.test(hookName) || !importedHooks.has(hookName)) {
						next();
						return;
					}

					const parent = path[path.length - 1];
					const bindingNames = getOuterBindingNames(parent);
					if (bindingNames.length === 0) {
						next();
						return;
					}

					let name = bindingNames[0];
					hasHelper = true;
					s.prependLeft(node.start, "addHookName(");
					s.appendRight(node.end, `, ${JSON.stringify(name)})`);
					next();
				},
			});
			if (!hasHelper) return;

			const firstNode = /** @type {unknown} */ (ast.body[0]);
			s.prependLeft(
				/** @type {NodeWithRange<Program>} */ (firstNode).start,
				'import { addHookName } from "preact/devtools";\n',
			);

			return {
				code: s.toString(),
				map: s.generateMap({ hires: "boundary" }),
			};
		},
	};
}

/**
 * @param {NodeWithRange<Program>} ast
 * @returns {Set<string>}
 */
function getImportedHooks(ast) {
	const hooks = new Set();
	for (const node of ast.body) {
		if (node.type !== "ImportDeclaration") continue;

		const source =
			typeof node.source.value === "string" ? node.source.value : null;
		if (!source || !HOOK_IMPORTS.has(source)) continue;

		for (const specifier of node.specifiers) {
			if (
				specifier.type !== "ImportSpecifier" ||
				specifier.imported.type !== "Identifier"
			)
				continue;

			const importedName = specifier.imported.name;
			if (
				!HOOK_NAME_RE.test(importedName) ||
				specifier.local.name !== importedName
			)
				continue;

			hooks.add(importedName);
		}
	}
	return hooks;
}

/**
 * @param {Node | undefined} node
 * @returns {string[]}
 */
function getOuterBindingNames(node) {
	if (!node) return [];

	switch (node.type) {
		case "VariableDeclarator":
			return extractAssignedNames(node.id);
		case "AssignmentExpression":
			return extractAssignedNames(node.left);
		case "Identifier":
		case "ArrayPattern":
		case "ObjectPattern":
		case "RestElement":
		case "AssignmentPattern":
			return extractAssignedNames(node);
		default:
			return [];
	}
}
