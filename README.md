# @preact/preset-vite

An all in one preset for writing Preact apps with the vite bundler.

Features:

- ↻ Sets up Hot Module Replacement via [prefresh](https://github.com/JoviDeCroock/prefresh/tree/main/packages/vite)
- 🔧 Enables [Preact Devtools](https://preactjs.github.io/preact-devtools/) bridge during development 

## Installation

First intall the preset package from npm:

```bash
npm install --save-dev @preact/preset-vite
# or
yarn add -D @preact/preset-vite
```

Enhance your vite config with the Preact preset: 

```js
// vite.config.js or vite.config.ts
import { defineConfig } from "vite";
import withPreact from "@preact/preset-vite";

export default defineConfig(withPreact({
  // Your custom config
}));
```

## Options

## License

MIT, see [the license file](./LICENSE).
