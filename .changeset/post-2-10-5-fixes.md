---
'@preact/preset-vite': patch
---

- prevent the CJS build from rewriting the hook names helper import to `require()`
- skip devtools plugin resolve/transform hooks unless devtools support is enabled
- add the `vite-plugin` keyword for registry discovery
