# @preact/preset-vite

An all in one preset for writing Preact apps with the [vite](https://github.com/vitejs/vite) bundler.

Features:

- Sets up Hot Module Replacement via [prefresh](https://github.com/JoviDeCroock/prefresh/tree/main/packages/vite)
- Enables [Preact Devtools](https://preactjs.github.io/preact-devtools/) bridge during development
- Aliases React to `preact/compat`

## Installation

First intall the preset package from npm:

```bash
npm install --save-dev @preact/preset-vite
# or
yarn add -D @preact/preset-vite
```

Enhance your vite config with the Preact preset plugin in your `vite.config.ts` or `vite.config.js`:

```js
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()]
});
```

## Options

Options can be passed to our preset plugin via the first argument:

```js
export default defineConfig({
  plugins: [
    preact({ devtoolsInProd: true })
  ]
});
```

### Available options

| Option | Type | Default | Description |
|---|---|---|---|
| `devtoolsInProd` | `boolean` | `false` | Inject devtools bridge in production bundle instead of only in development mode |
| `devToolsEnabled` | `boolean` | `true` | Inject devtools bridge |
| `prefreshEnabled` | `boolean` | `true` | Inject [Prefresh](https://github.com/preactjs/prefresh) for HMR |
| `reactAliasesEnabled` | `boolean` | `true` | Aliases `react`, `react-dom` to `preact/compat` |
| `babel` | `object` | | See [Babel configuration](#babel-configuration) |
| `prerender` | `object` | | See [Prerendering configuration](#prerendering-configuration) |

#### Babel configuration

The `babel` option lets you add plugins, presets, and [other configuration](https://babeljs.io/docs/en/options) to the Babel transformation performed on each JSX/TSX file.

```js
preact({
  babel: {
    presets: [...],
    // Your plugins run before any built-in transform (eg: Fast Refresh)
    plugins: [...],
    // Use .babelrc files
    babelrc: true,
    // Use babel.config.js files
    configFile: true,
  }
})
```

#### Prerendering configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enables prerendering |
| `prerenderScript` | `string` | `undefined` | Absolute path to script containing exported `prerender()` function. If not provided, will try to find the prerender script in the scripts listed in your HTML entrypoint |
| `renderTarget` | `string` | `"body"` | Query selector for where to insert prerender result in your HTML template |
| `additionalPrerenderRoutes` | `string` | `undefined` | Prerendering will automatically discover links to prerender, but if there are unliked pages that you want to prererender (such as a `/404` page), use this option to specify them |

To prerender your app, you'll need to set `prerender.enabled` to `true` in the plugin options (`vite.config.js`), export a `prerender()` function one of the scripts listed in your HTML entry point (or the script specified through `prerender.prerenderScript`), and add a `prerender` attribute to that script tag in your HTML entry point (`<script prerender src="...">`). How precisely you generate an HTML string from your app is up to you, but you'll likely want to use [`preact-render-to-string`](https://github.com/preactjs/preact-render-to-string) or a wrapper around it such as [`preact-iso`'s `prerender`](https://github.com/preactjs/preact-iso). Whatever you choose, you simply need to return an object from your `prerender()` function containing an `html` property with your HTML string.

[For an example implementation, see our demo](./demo/src/index.tsx)

```js
import { render } from 'preact-render-to-string';

export async function prerender(data) {
    const html = render(`<h1>hello world</h1>`);

    return {
        html,
        // Optionally add additional links that should be
        // prerendered (if they haven't already been)
        links: new Set(['/foo', '/bar']),
        // Optionally configure and add elements to the `<head>` of
        // the prerendered HTML document
        head: {
            // Sets the "lang" attribute: `<html lang="en">`
            lang: 'en',
            // Sets the title for the current page: `<title>My cool page</title>`
            title: 'My cool page',
            // Sets any additional elements you want injected into the `<head>`:
            //   <link rel="stylesheet" href="foo.css">
            //   <meta property="og:title" content="Social media title">
            elements: new Set([
                { type: 'link', props: { rel: 'stylesheet', href: 'foo.css' } },
                { type: 'meta', props: { property: 'og:title', content: 'Social media title' } }
            ])
        }
    };
}
```

## License

MIT, see [the license file](./LICENSE).
