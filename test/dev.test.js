import { afterEach, beforeEach, describe, it } from "node:test";
import { devServerURL, launchDemoDevServer } from "./util.js";

describe("dev server", async () => {
	let devServerProc;
	beforeEach(async () => {
		devServerProc = await launchDemoDevServer();
	});

	afterEach(() => {
		devServerProc.kill();
	});

	it("serves src/index.tsx", async () => {
		const mainURL = new URL("/src/index.tsx", devServerURL);
		const res = await fetch(mainURL);
		if (!res.ok) {
			const body = await res.text();
			throw new Error(
				`Response for ${mainURL} indicated failure. Status code: ${res.status}. Full response:\n${body}`,
			);
		}
	});
});
