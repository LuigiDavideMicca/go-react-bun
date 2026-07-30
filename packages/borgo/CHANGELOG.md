# Changelog

## [0.11.0](https://github.com/LuigiDavideMicca/borgo/compare/v0.10.1...v0.11.0) (2026-07-30)


### Features

* /healthz on both servers and opt-in prometheus metrics on the front ([530810e](https://github.com/LuigiDavideMicca/borgo/commit/530810ea11b2cafa1b0694336721b511a3d30d55))
* borgo deploy init writes the blessed caddy, nginx, systemd and compose configs ([3f6e6fc](https://github.com/LuigiDavideMicca/borgo/commit/3f6e6fc9ee9044169b3d57bbc9fc947751961c3f))
* borgo doctor diagnoses the environment with actionable fixes ([01ff323](https://github.com/LuigiDavideMicca/borgo/commit/01ff323117ec16208c3cf905f1edd4a8d719eec3))
* borgo export prerenders static routes into dist/site, loaders opt in with prerender ([7d7cfa2](https://github.com/LuigiDavideMicca/borgo/commit/7d7cfa2e12114ed4ce95e6b01ad5b5ed3625dfe9))
* systematic auth, borgo.Auth handlers over stdlib pbkdf2, Authed middleware and csrf-protected actions ([304b144](https://github.com/LuigiDavideMicca/borgo/commit/304b144ba275e738e1418ca4ac58fddbdef0f932))
* typed channel.publish, borgogen rejects slashed push topics, export writes 404.html ([462bcee](https://github.com/LuigiDavideMicca/borgo/commit/462bcee5d1decc087f58e84baf5e5f091474e4af))
* typed websocket events, borgo.PushT feeds a generated event map that types subscribe ([3eaad62](https://github.com/LuigiDavideMicca/borgo/commit/3eaad62964d6b638fda2a79297a9f1cde3757c51))


### Bug Fixes

* a client disconnect mid-stream crashed the server, cancel through the reader ([2a323c9](https://github.com/LuigiDavideMicca/borgo/commit/2a323c9e4fcac0dfc5d8aa4c5e162347f2500298))
* answer head requests instead of 405, body stripped after render ([3aece13](https://github.com/LuigiDavideMicca/borgo/commit/3aece13c30a7f3af3a5d25e5782313b1faf77bc5))
* cap proxy retry buffering at 10mb, large or unsized bodies stream through ([067e971](https://github.com/LuigiDavideMicca/borgo/commit/067e97145e4cfc1dcff43c7d89b47af484894b2f))
* compare the push key in constant time ([c15905b](https://github.com/LuigiDavideMicca/borgo/commit/c15905b4e6038642fc4529d8af7fa881b238f370))
* decode static paths and route params safely, check traversal on the decoded form ([6a5c8a1](https://github.com/LuigiDavideMicca/borgo/commit/6a5c8a1fed57c40ca640e998950773ad67e71621))
* dev kills its children on any exit, a broken go edit keeps the previous api serving ([2a5a4d5](https://github.com/LuigiDavideMicca/borgo/commit/2a5a4d5ad33f7247ba11522af6382333243e63c2))
* export lists 404.html apart, counts assets logically and survives zero pages ([10319fe](https://github.com/LuigiDavideMicca/borgo/commit/10319fef1e1a4c4627c48ee93203804e68efca88))
* export summary reports page failures instead of a green check ([07e1b05](https://github.com/LuigiDavideMicca/borgo/commit/07e1b05ece70f16ae90dcbd52edf37bbc7aef2bb))
* friendly guidance when a stale api process blocks the binary swap ([441718a](https://github.com/LuigiDavideMicca/borgo/commit/441718af517c4cd6b3cbfee8d86510abd35a1d4e))
* retry refused connections while the api restarts, actions and loaders included ([c1d0c35](https://github.com/LuigiDavideMicca/borgo/commit/c1d0c354ec85bd21549f3d2c80e8ae8fcbcf461d))
* stale navigations must not render over newer ones, back flushes the pending scroll save ([5b20547](https://github.com/LuigiDavideMicca/borgo/commit/5b205477e6f2cc9bcb5fd99f3ed4be0d623719a8))
* stamp-guard reloads on hydrated pages, a reconnect must not replay them ([ae29812](https://github.com/LuigiDavideMicca/borgo/commit/ae2981254d26536eeec59caaa794beab0e40fb83))

## 0.10.1 (2026-07-29)

Version convergence: both packages now share one linked version.


### Bug Fixes

* serve precompressed assets and gzip dynamic responses ([e68a8ef](https://github.com/LuigiDavideMicca/borgo/commit/e68a8ef6eac4c156d316e7511174c9a0f62e1569))

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
