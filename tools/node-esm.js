const fs = require("fs").promises;
const path = require("path");

(async () => {
	const dir = path.join(__dirname, "..", "dist", "esm");
	const files = await fs.readdir(dir);

	for (const file of files) {
		if (file.endsWith(".mjs")) continue;

		let content = await fs.readFile(path.join(dir, file), "utf-8");
		const target = path.join(
			dir,
			path.basename(file, path.extname(file)) + ".mjs",
		);

		content = content.replace(
			/^import\s+(.*)\s+from\s["'](.*?)["'];/gm,
			(m, importees, spec) => {
				if (/^\.?\.\//.test(spec)) {
					spec = spec + ".mjs";
				}

				return `import ${importees} from "${spec}";`;
			},
		);

		await fs.writeFile(target, content);
	}
})();
