# Changelog

## [0.9.1](https://github.com/LuigiDavideMicca/borgo/compare/v0.9.0...v0.9.1) (2026-07-29)


### Bug Fixes

* compile scss with sass-embedded, dropping the postinstall bun blocks on fresh installs ([bb4ba67](https://github.com/LuigiDavideMicca/borgo/commit/bb4ba67afab310ec5bbe4809f371cc3d29ced608))
* document the bun shim path failure and the safe ways around it ([f6404d0](https://github.com/LuigiDavideMicca/borgo/commit/f6404d039255befde493e109dfe29a11ae1befd1))
* fall back to ascii marks on legacy windows consoles ([f4ef03d](https://github.com/LuigiDavideMicca/borgo/commit/f4ef03dd95ccd6187b56a8746e350bbe4bce0100))
* make hot reload reliable and give hook edits next-level fast refresh ([51ff7e1](https://github.com/LuigiDavideMicca/borgo/commit/51ff7e105827de7878bb0da3fde63616db0a1d2d))
* publish the runtime as borgo-framework, npm rejects the short name ([1c8d5ca](https://github.com/LuigiDavideMicca/borgo/commit/1c8d5caa7128fc3eb137715d91eb14edccb46d0d))
* rename the generated entry imports to borgo-framework ([35e1a73](https://github.com/LuigiDavideMicca/borgo/commit/35e1a73e91d20df7e54f81d85d25d07d625bb234))
* treat piped windows output as legacy too, powershell decodes it as ansi ([a9450df](https://github.com/LuigiDavideMicca/borgo/commit/a9450df0684907b1ab68c5e9a1718be66c8837b4))

## 0.9.0 (2026-07-29)


### Features

* branded cli and server output ([8906f7e](https://github.com/LuigiDavideMicca/borgo/commit/8906f7eb7fc235ab19b7ce7dd3690a7fbfd60c36))
* client-side navigation ([285faf2](https://github.com/LuigiDavideMicca/borgo/commit/285faf291bde1fd2f631bb6c46174fa06f7117f5))
* complete the typed bridge - helpers, writejson, type overrides, typed request bodies ([d9471ee](https://github.com/LuigiDavideMicca/borgo/commit/d9471eef83e524ba0ea5d97ca2349374db168198))
* deploy story - dockerfiles, compose, deploy guide, split-mode start ([6bc02d6](https://github.com/LuigiDavideMicca/borgo/commit/6bc02d632a0dff0af48f869ede2bcbabfad90c38))
* error overlay, custom error pages and framework violation messages ([6252297](https://github.com/LuigiDavideMicca/borgo/commit/62522976baedb79e24177a54ef0f0f132cd5cff0))
* fast refresh over a dev websocket channel, css hot swap ([33f9ff4](https://github.com/LuigiDavideMicca/borgo/commit/33f9ff440ef246c61953b8afdbae6c8035b3517f))
* first-class server-sent events ([dd0b714](https://github.com/LuigiDavideMicca/borgo/commit/dd0b7140cb71f096dfadb4d31fa0a4778d7e8db9))
* first-class websockets - topic relay on the front server, borgo.Push from go ([ac35262](https://github.com/LuigiDavideMicca/borgo/commit/ac35262818ebb2d9d857b857855bc57c3bdfb0fe))
* form actions ([cf5f81e](https://github.com/LuigiDavideMicca/borgo/commit/cf5f81e00c190812bd730912c96e0919468ef7cc))
* islands - independent hydration on hydrate=false pages ([d4d8b15](https://github.com/LuigiDavideMicca/borgo/commit/d4d8b1581b966d16e49aa3933bf768f2ab7b6211))
* nested layouts, head management and streaming ssr ([45865b0](https://github.com/LuigiDavideMicca/borgo/commit/45865b0361f787ffc01e99f5984f5d50828f4d1f))
* per-page code splitting with lazy route chunks ([454493b](https://github.com/LuigiDavideMicca/borgo/commit/454493bea3b88f33540b850d9f51ab87536d4469))
* per-page partial hydration ([50674d1](https://github.com/LuigiDavideMicca/borgo/commit/50674d169a6f2276995af84b9b3831ebe7b35949))
* prefetch on hover and viewport, per-entry scroll restoration ([6d81af1](https://github.com/LuigiDavideMicca/borgo/commit/6d81af14ce68c3577619d9e305eb18641252bcbf))
* route directives replace init boilerplate ([82f891e](https://github.com/LuigiDavideMicca/borgo/commit/82f891ed051895d340fdbe7265772535ea726234))
* signed-cookie sessions, cache helpers, loader guards with cookie forwarding ([334ff70](https://github.com/LuigiDavideMicca/borgo/commit/334ff70e5faa2f8f949ed8b22e8f22342339ae7f))
* strip loaders and actions from client chunks ([0f92044](https://github.com/LuigiDavideMicca/borgo/commit/0f92044abb5c98e25418f5d39835600f917da4f5))
* typed go-to-ts bridge via borgogen ([eef2c27](https://github.com/LuigiDavideMicca/borgo/commit/eef2c27b18786c3117fcc8382c40bfe1a54e591e))


### Bug Fixes

* debounce watch rebuilds per side ([66e2dd8](https://github.com/LuigiDavideMicca/borgo/commit/66e2dd88a216e5fef6ffaba0861371f40e6167e4))
