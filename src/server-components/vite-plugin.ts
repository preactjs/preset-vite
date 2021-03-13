import { Plugin } from "vite";
import fs from "fs";
import path from "path";
import { transformSync } from "@babel/core";
// @ts-ignore
import typescript from "@babel/plugin-syntax-typescript";
// @ts-ignore
import jsx from "@babel/plugin-syntax-jsx";
import { babelServerComponents } from "./babel/index";
import { IMPORT_SERVER_REG, SERVER_FILE_REG } from "./util";

export function serverComponentPlugin(): Plugin {
	const FILE = "@preact-server-component";

	return {
		name: "preact:server-components",

		enforce: "pre",

		resolveId(id, importer, options, ssr) {
			console.log(id, importer, options, ssr);
			if (id === FILE) {
				return FILE;
			}
		},

		load(id) {
			if (id === FILE) {
				return `import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

export const lazy = (fn) => (props) => {
	const [loaded, set] = useState(null);

	useEffect(() => {
		fn().then(component => set({ component }));
	}, []);

	return loaded ? h(loaded.component, props) : null;
}
				`;
			}
		},

		transform(code, id) {
			// Check if we are a server component
			if (SERVER_FILE_REG.test(id)) {
				//
			}
			// We're not a server component. Check if we
			// import one. If we do, then we need to mark
			// that boundary via a component
			else if (IMPORT_SERVER_REG.test(code)) {
				const out = transformSync(code, {
					plugins: [
						[typescript, { isTSX: /\.tsx$/.test(id) }],
						[babelServerComponents, { importId: "lazy", importSource: FILE }],
					],
				});

				if (!out) {
					throw new Error(`Could not compile ${id}`);
				}

				// TODO: Sourcemaps
				return {
					code: out.code!,
					map: out.map,
				};
			}

			return code;
		},
	};
}
