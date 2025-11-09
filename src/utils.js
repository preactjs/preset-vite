export { createFilter } from "vite";

/**
 * Allows to ignore query parameters, as in Vue SFC virtual modules.
 *
 * @param {string} url
 */
export function parseId(url) {
	return { id: url.split("?", 2)[0] };
}
