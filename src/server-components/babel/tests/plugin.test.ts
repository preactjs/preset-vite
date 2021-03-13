import { babelServerComponents } from "../index";
import { newFixtureRunner } from "babel-plugin-helpers";
import { IMPORT_SERVER_REG, SERVER_FILE_REG } from "../../util";

const fixture = newFixtureRunner(__dirname, {
	plugins: [[babelServerComponents, { foo: "bar" }]],
});

function assertMatch(str: string, reg: RegExp) {
	if (!reg.test(str)) {
		throw new Error(`Regex did not match.\n\n  Regex: ${reg}\n  input: ${str}`);
	}
}

describe("Server Components (Babel)", () => {
	it("transpile imports", () => {
		fixture("simple");
	});

	describe("import regex", () => {
		it("matches", () => {
			assertMatch(`'foo.server'`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server.js"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server.jsx"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server.ts"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server.tsx"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server.tsx?foo=bar"`, IMPORT_SERVER_REG);
			assertMatch(`"foo.server?foo=bar"`, IMPORT_SERVER_REG);
			assertMatch(`"/src/Bar.server.tsx"`, IMPORT_SERVER_REG);
			assertMatch(`"./src/Bar.server.tsx"`, IMPORT_SERVER_REG);
			assertMatch(`"../src/Bar.server.tsx"`, IMPORT_SERVER_REG);
		});

		it("does not match", () => {
			assertMatch(`"../src/Bar.server.tsx"`, IMPORT_SERVER_REG);
		});
	});

	describe("server component file regex", () => {
		it("matches", () => {
			assertMatch(`foo.server.js`, SERVER_FILE_REG);
			assertMatch(`foo.server.jsx`, SERVER_FILE_REG);
			assertMatch(`foo.server.ts`, SERVER_FILE_REG);
			assertMatch(`foo.server.tsx`, SERVER_FILE_REG);
		});
	});
});
