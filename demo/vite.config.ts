import { defineConfig } from "vite";
import preact from "../src/index";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [preact()],
});
