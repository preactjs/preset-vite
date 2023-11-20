import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { devServerURL, launchDemoDevServer } from "./util.mjs";

describe("dev server", async () => {
	let devServerProc;
	beforeEach(async () => {
		devServerProc = await launchDemoDevServer();
	});

	afterEach(() => {
		// Until nodejs/node#45204 is released in node v18, this won't be called on
		// test failures, so we'll need to manually wrap tests for now
		devServerProc.kill();
	});

	// TODO: Remove this wrapper once nodejs/node#45204 is released
	const wrap = fn => {
		return async (...args) => {
			try {
				await fn(...args);
			} finally {
				devServerProc.kill();
			}
		};
	};

	it(
		"serves src/main.tsx",
		wrap(async () => {
			const mainURL = new URL("/src/index.tsx", devServerURL);
			const res = await fetch(mainURL);
			if (!res.ok) {
				const body = await res.text();
				throw new Error(
					`Response for ${mainURL} indicated failure. Status code: ${res.status}. Full response:\n${body}`,
				);
			}
		}),
	);
});
