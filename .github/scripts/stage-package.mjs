#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const access = pkg.publishConfig?.access || "public";
const distTag = pkg.version.match(/^[^-]+-([0-9A-Za-z-]+)/)?.[1] || "latest";
const tagName = `v${pkg.version}`;

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
	});

	if (options.capture) {
		process.stdout.write(result.stdout || "");
		process.stderr.write(result.stderr || "");
	}

	if (result.status !== 0) process.exit(result.status || 1);
	return result.stdout || "";
}

function versionExists() {
	const result = spawnSync("npm", ["view", `${pkg.name}@${pkg.version}`, "version", "--json"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.status === 0) return true;
	const output = `${result.stdout}\n${result.stderr}`;
	if (output.includes("E404") || output.includes("No match found")) return false;

	process.stdout.write(result.stdout || "");
	process.stderr.write(result.stderr || "");
	throw new Error(`Could not check npm version for ${pkg.name}@${pkg.version}`);
}

if (versionExists()) {
	console.log(`${pkg.name}@${pkg.version} is already published; skipping stage publish.`);
	process.exit(0);
}

console.log(`Staging ${pkg.name}@${pkg.version} with dist-tag ${distTag}...`);
const output = run(
	"npm",
	["stage", "publish", ".", "--provenance", "--access", access, "--tag", distTag, "--json"],
	{ capture: true },
);

const stageId = output.match(/"stageId"\s*:\s*"([^"]+)"/)?.[1];
const existingTag = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`], {
	stdio: "ignore",
});
if (existingTag.status === 0) {
	console.log(`Git tag ${tagName} already exists locally.`);
} else {
	run("git", ["tag", tagName, "-m", tagName]);
}

// changesets/action parses this line, then pushes the tag and creates the GitHub release.
console.log(`New tag: ${tagName}`);
console.log(`Staged ${pkg.name}@${pkg.version}${stageId ? ` (${stageId})` : ""}`);
console.log("Approve staged packages with `npm stage approve <stage-id>` after review.");
