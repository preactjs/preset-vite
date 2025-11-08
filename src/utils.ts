export { createFilter } from "vite";

// Allows to ignore query parameters, as in Vue SFC virtual modules.
export function parseId(url: string) {
	return { id: url.split("?", 2)[0] };
}
