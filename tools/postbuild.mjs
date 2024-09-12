import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Note: Once TypeScript 4.5 is out of beta we can drop the whole script.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dir = path.join(__dirname, "..", "dist", "esm");

for (const file of fs.readdirSync(dir)) {
	const ext = file.endsWith(".d.ts") ? ".mts" : ".mjs";
	const target = path.join(dir, path.basename(file, path.extname(file)) + ext);

	fs.renameSync(path.join(dir, file), target);

	const source = fs.readFileSync(target, "utf-8");
	const code = source.replace(
		/(\w+)\.js(["'])/g,
		(_, spec, quot) => `${spec}.mjs${quot}`,
	);
	if (code !== source) {
		fs.writeFileSync(target, code);
	}
}
