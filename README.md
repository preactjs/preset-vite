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
| `renderTarget` | `string` | `"body"` | Query selector for where to insert prerender result in your HTML template |
| `prerenderScript` | `string` | `undefined` | Absolute path to script containing exported `prerender()` function. If not provided, will try to find the prerender script in the scripts listed in your HTML entrypoint |
| `additionalPrerenderRoutes` | `string[]` | `undefined` | Prerendering will crawl your site automatically, but you'd like to prerender some pages that may not be found (such as a `/404` page), use this option to specify them |
| `previewMiddlewareEnabled` | `boolean` | `false` | Vite's preview server as of v5 will not use our prerendered HTML documents automatically. This option enables a middleware that will correct this, allowing you to test the result of prerendering locally |
| `previewMiddlewareFallback` | `string` | `/index.html` | Fallback path to be used when an HTML document cannot be found via the preview middleware, e.g., `/404` or `/not-found` will be used when the user requests `/some-path-that-does-not-exist` |

To prerender your app, you'll need to do these things:
1. Enable prerendering in the plugin options
2. Specify your render target, if you want the HTML to be inserted anywhere other than the `document.body`. This location likely should match `render()`, i.e., `render(<App />, document.querySelector('#app'))` -> `'#app'`
4. Create and export a `prerender()` function from a script. You could add this to your app entrypoint or create a completely separate file for it, either will work. See below for a usage example
5. Specify where your `prerender()` function is by either a) adding a `prerender` attribute to the script tag that contains it in your entry HTML (`<script prerender src="./my-prerender-script.js">`) or b) use the `prerenderScript` plugin option to specify the location with an absolute path

The plugin simply calls the prerender function you provide so it's up to you to determine how your app should be prerendered. You'll likely want to use [`preact-render-to-string`](https://github.com/preactjs/preact-render-to-string), or a wrapper around it such as [`preact-iso`'s `prerender`](https://github.com/preactjs/preact-iso), but whatever you choose, the minimum you'll need to return is an object containing an `html` property with your HTML string which will then be inserted according to your `renderTarget`.

Your `prerender()` function can be asynchronous, so feel free to make HTTP requests to retrieve data (`fetch(...)`), read files from disk (`fs.readFile(...)`), or similar things to set up your app.

[For a full example implementation, see our demo](./demo/src/index.tsx)

```js
import { prerender as ssr } from 'preact-iso';

function App() {
    return <h1>Hello World!</h1>
}

export async function prerender(data) {
    const { html, links: discoveredLinks } = ssr(<App />);

    return {
        html,
        // Optionally add additional links that should be
        // prerendered (if they haven't already been)
        links: new Set([...discoveredLinks, '/foo', '/bar']),
        // Optional data to serialize into a script tag for use on the client:
        //   <script type="application/json" id="preact-prerender-data">{"url":"/"}</script>
        data: { url: data.url },
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
