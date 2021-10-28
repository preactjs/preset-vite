import type { CreateFilter } from "@rollup/pluginutils";

export { createFilter } from "@rollup/pluginutils";

export type RollupFilter = ReturnType<CreateFilter>;

// Allows to ignore query parameters, as in Vue SFC virtual modules.
export function parseId(url: string) {
	return { id: url.split("?", 2)[0] };
}
