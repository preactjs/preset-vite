import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dir = path.join(__dirname, "..", "dist", "esm");

for (const file of fs.readdirSync(dir)) {
	fs.renameSync(
		path.join(dir, file),
		path.join(dir, path.basename(file, path.extname(file)) + ".mjs"),
	);
}
