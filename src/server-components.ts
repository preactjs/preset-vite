import { mergeConfig, Plugin } from "vite";

export function preactServerComponents(): Plugin {
	return {
		name: "preact:server-components",

		transform(code, id) {
			// Check if we are a server component
			if (/\.server\.[tj]sx?$/.test(id)) {
				//
			}
			// We're not a server component. Check if we
			// import one. If we do, then we need to mark
			// that boundary via a component
			else if (/\.server\.[tj]sx['"]$/) {
				//
			}

			return code;
		},
	};
}
