import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dir = (...args) => path.join(__dirname, "..", ...args);

export const devServerURL = new URL("http://127.0.0.1:3000/");

/**
 * Wait for vite dev server to start
 * @param {import('node:child_process').ChildProcess} devServerProc
 * @returns {Promise<void>}
 */
function waitForServerStart(devServerProc) {
	return new Promise((resolve, reject) => {
		function onError(err) {
			cleanup();
			reject(err);
		}

		/** @param {number | null} code */
		function onClose(code) {
			cleanup();
			reject(new Error(`Dev server closed unexpectedly with code "${code}"`));
		}

		let stdout = "";
		/** @param {Buffer | string} chunk */
		function onData(chunk) {
			try {
				/** @type {string} */
				const data = Buffer.isBuffer(chunk)
					? chunk.toString("utf-8")
					: chunk.toString();

				stdout += data;

				if (stdout.match(/ready in [0-9]+ms/g) != null) {
					cleanup();
					resolve();
				}
			} catch (e) {
				reject(e);
			}
		}

		function cleanup() {
			try {
				devServerProc.stdout?.off("data", onData);
				devServerProc.off("error", onError);
				devServerProc.off("close", onClose);
			} catch (e) {
				reject(e);
			}
		}

		devServerProc.stdout?.on("data", onData);
		devServerProc.on("error", onError);
		devServerProc.on("close", onClose);
	});
}

export async function launchDemoDevServer() {
	/** @type {import('node:child_process').ChildProcess} */
	const devServerProc = spawn(
		process.execPath,
		[dir("node_modules/vite/bin/vite.js")],
		{ cwd: dir("demo"), stdio: "pipe" },
	);

	await waitForServerStart(devServerProc);

	return devServerProc;
}
