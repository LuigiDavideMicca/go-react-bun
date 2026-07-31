# Changelog

## [0.20.1](https://github.com/LuigiDavideMicca/borgo/compare/v0.20.0...v0.20.1) (2026-07-31)


### Features

* borgo pwa init writes the manifest and service worker instead of describing them ([88e9464](https://github.com/LuigiDavideMicca/borgo/commit/88e946491cf3c81f1b673f7d995d2eb29b22fb15))


### Bug Fixes

* an unnameable chunk gets a url-safe filename instead of literal brackets ([5d5590d](https://github.com/LuigiDavideMicca/borgo/commit/5d5590d8b263475afd0533fdd803e6c1e7f2e416))

## [0.20.0](https://github.com/LuigiDavideMicca/borgo/compare/v0.11.0...v0.20.0) (2026-07-31)


### Features

* api client accepts an opt-in per-call timeout ([d514e2b](https://github.com/LuigiDavideMicca/borgo/commit/d514e2b96f117ff0d9fe89485a16b36e79408f3e))
* enhanced form actions submit over fetch and keep the scroll position ([df38c43](https://github.com/LuigiDavideMicca/borgo/commit/df38c43b5e30b9224907ecd14ed2569baa511382))
* opt-in tailwind v4 pipeline behind the --tailwind flag ([2d2f725](https://github.com/LuigiDavideMicca/borgo/commit/2d2f7253136eaeffb990325b042dbcb304ed0dc1))
* pwa mechanics - precache manifest, no-cache service worker, guarded registration helper ([061b155](https://github.com/LuigiDavideMicca/borgo/commit/061b15526ad020ce588eae58e272807994ce495c))
* ship production security headers, csp included ([2c7ce07](https://github.com/LuigiDavideMicca/borgo/commit/2c7ce070d1a11a4bcc79c352ddabefbcec2bd9fa))


### Bug Fixes

* a channel closed during its reconnect backoff stays closed ([015899a](https://github.com/LuigiDavideMicca/borgo/commit/015899aedb9a77ff5c97f451d1ad85be03152462))
* a client that hangs up mid-body no longer buys a 500 render ([425d740](https://github.com/LuigiDavideMicca/borgo/commit/425d7402de87bb04165eb44d75363bd34c17e818))
* a connection header the client malformed no longer answers /api with a document ([2b6dd02](https://github.com/LuigiDavideMicca/borgo/commit/2b6dd02467904f2cec118648138fd1334b80772d))
* a deadline that fires under arriving headers answers 504, not an empty 200 ([16238ee](https://github.com/LuigiDavideMicca/borgo/commit/16238eeb05fc3f0fd5837383093740eb21b73f42))
* a document typed TEXT/HTML is still a document to the csp and to the runtime ([9ec71bb](https://github.com/LuigiDavideMicca/borgo/commit/9ec71bb9540840d991a8bd3015cc8dfdae97c15d))
* a dot-segment prerender param no longer writes the page outside dist/site ([5d4cd0e](https://github.com/LuigiDavideMicca/borgo/commit/5d4cd0e6414f5071fd906d675cee07c3a95c9d68))
* a failed prefetch import no longer surfaces as an unhandled rejection ([649da0b](https://github.com/LuigiDavideMicca/borgo/commit/649da0b15e25a460efb58d43ee358f15d7434a1a))
* a form with a submit in flight swallows re-entrant submits ([2cfbecf](https://github.com/LuigiDavideMicca/borgo/commit/2cfbecfb94712265eaeda796e20d3aef3010d63c))
* a head no longer answers content-length zero for a body it never measured ([1162f80](https://github.com/LuigiDavideMicca/borgo/commit/1162f8074f026c2ee86143334f55a1e8acf6a649))
* a head on an asset reports the length a get would return, not zero ([11b5465](https://github.com/LuigiDavideMicca/borgo/commit/11b54650403210bfcc09d0416f29d042742d8806))
* a link to the current page replaces its history entry instead of doubling it ([27414be](https://github.com/LuigiDavideMicca/borgo/commit/27414be927e83a824f9101faa0434e0a3ed4e95b))
* a missing pages/ dir fails with a framework message instead of a bare enoent ([03fa5b1](https://github.com/LuigiDavideMicca/borgo/commit/03fa5b1e924a668e388f4869f669619cc1b61fc2))
* a range whose validator no longer matches gets the whole file, not a splice ([10235a4](https://github.com/LuigiDavideMicca/borgo/commit/10235a40647a22d67e69d932d6bda75b55621677))
* a repeated content-length no longer costs the proxy its retry ([8334bfa](https://github.com/LuigiDavideMicca/borgo/commit/8334bfa63cf9edc59708c8fa89782392aa48bdd4))
* a stale if-range answer states the content type its stream cannot carry ([270347f](https://github.com/LuigiDavideMicca/borgo/commit/270347fb6dc061fdd7be26aba77c627015a95691))
* a torn watcher read no longer double-builds and double-reloads the api ([b4c3798](https://github.com/LuigiDavideMicca/borgo/commit/b4c379806b66def38ea703c234a921ae4209bdd7))
* a tossed duplicate cookie cannot survive the post-action jar rebuild ([6e3692a](https://github.com/LuigiDavideMicca/borgo/commit/6e3692a5adb135dd55f9c67288451bc4ce153a08))
* an asset whose precompressed sibling vanished degrades instead of failing ([8a074ee](https://github.com/LuigiDavideMicca/borgo/commit/8a074ee3334ec9eebf2d888e0be73a8fd32f573c))
* an upstream 101 becomes a 502 instead of a desynchronised client ([890369e](https://github.com/LuigiDavideMicca/borgo/commit/890369efd4caf35d724f17d2ce7a38602db80682))
* api client caps error bodies, drops empty query values, names the route on bad json ([3847050](https://github.com/LuigiDavideMicca/borgo/commit/3847050343a10513cee35fc9f1bd7fd0909c6b86))
* api client rejects a route key with no method ([54fc8e2](https://github.com/LuigiDavideMicca/borgo/commit/54fc8e262a6e8f63c8d1a5071f776af97859134e))
* attach the dev channel before the no-route bail so unrouted pages hot-reload ([62952b7](https://github.com/LuigiDavideMicca/borgo/commit/62952b7de531bef3154441f79954d04853a03502))
* block ntfs stream aliases on windows asset paths, allow header on the json 405 ([3a9aca0](https://github.com/LuigiDavideMicca/borgo/commit/3a9aca00439ab59ed535dbc86c464447abeca092))
* borgo start propagates the api's real exit code and stops cleanly on sigint/sigterm ([9bbaf89](https://github.com/LuigiDavideMicca/borgo/commit/9bbaf89f67065ec87c9410e2ebc5b7a8b513e55c))
* bound the runtime's long-lived state - link observer, props cache, socket retries ([bcf9904](https://github.com/LuigiDavideMicca/borgo/commit/bcf99044342ee7b2fcefba993287c4ab8d9dfb5e))
* build and export fail hard when borgogen fails instead of shipping stale types ([f6e797b](https://github.com/LuigiDavideMicca/borgo/commit/f6e797b1eae916b35dd9d5cd1898009baa0f0b0e))
* builds stamp their mode so borgo start rebuilds a dev-built asset tree for production ([88b1946](https://github.com/LuigiDavideMicca/borgo/commit/88b19468a20b4b78a63e9c1d3181ce8a9817c601))
* cap websocket topic subscriptions and message payloads ([16c36f5](https://github.com/LuigiDavideMicca/borgo/commit/16c36f505f1f63179de9a9fa24ebdc3ddb560bc7))
* claim the history entry a fragment link creates so scroll keys stay distinct ([aa3ad32](https://github.com/LuigiDavideMicca/borgo/commit/aa3ad328261e5182a59befa0cbcc9a7b3ebd12e4))
* compressing a document no longer undoes its backpressure ([5276302](https://github.com/LuigiDavideMicca/borgo/commit/5276302dd7e339349f87ee4b6165dddfc2c2fe66))
* dev fallback server reports a busy port instead of rethrowing unhandled ([d68056d](https://github.com/LuigiDavideMicca/borgo/commit/d68056d01b1351a401cc20724af338655864449d))
* dev handles sigterm, tells the truth when the binary swap gives up, ignores nested node_modules ([2729ed7](https://github.com/LuigiDavideMicca/borgo/commit/2729ed78095a07f4b2a6749e3c6761489506a608))
* dev says so when the api dies on its own instead of quietly serving 502s ([a0407ab](https://github.com/LuigiDavideMicca/borgo/commit/a0407abd385896e60fff245311dec67512e62731))
* dev watcher forgets the content hash of a deleted file ([0d76b89](https://github.com/LuigiDavideMicca/borgo/commit/0d76b89979540ee226ad5de645ed6645511a4d07))
* doctor reads localized netstat by row shape and skips the write-lock probe off windows ([fc60ebe](https://github.com/LuigiDavideMicca/borgo/commit/fc60ebe0741ddfeeda686fb3aa8dbbce65fbb882))
* doubled slashes no longer alias the single-slash route ([c9af8d9](https://github.com/LuigiDavideMicca/borgo/commit/c9af8d9e2fa0c68fe3f5be99a7197911d1a52a07))
* drop a raw action document that lands after a popstate ([b042c63](https://github.com/LuigiDavideMicca/borgo/commit/b042c63df69378582afade95561cb4314025e435))
* duplicate csrf cookies with differing values read as no token ([d65f4e3](https://github.com/LuigiDavideMicca/borgo/commit/d65f4e3ca8906e89be600a5b35a865fea933fc59))
* enhanced posts surface errors and redirects faithfully, csrf covers anonymous actions, ws checks origin ([bb9f4be](https://github.com/LuigiDavideMicca/borgo/commit/bb9f4be89ebc44299ea1744f806970eeb19fefdb))
* enhanced submits echo the live csrf cookie, not a stale field ([c3e7f42](https://github.com/LuigiDavideMicca/borgo/commit/c3e7f42f4f75c78aa3d7e5dd9d91b5ad0d4218ca))
* enhanced submits keep native form encoding semantics ([e06d2be](https://github.com/LuigiDavideMicca/borgo/commit/e06d2bebb29e6bfa9818e5837b7b37c29443860e))
* export picks distinct ephemeral ports and ignores a shell API_URL ([c1264f5](https://github.com/LuigiDavideMicca/borgo/commit/c1264f5d1e9d39fdcdbebe548b47f0a0b908c43c))
* export writes decoded directory names so non-ascii params resolve behind static servers ([6f6308e](https://github.com/LuigiDavideMicca/borgo/commit/6f6308e0a06c708f7884b842b35cc7ee32e9a438))
* fragment history entries stop refetching, hover prefetch waits for real intent ([4b18f43](https://github.com/LuigiDavideMicca/borgo/commit/4b18f43a45b193b652bab54161c2a6d7e021168e))
* head requests drop the body on every path, healthz and error pages included ([39f9ed4](https://github.com/LuigiDavideMicca/borgo/commit/39f9ed4fca2e8d7ca7806676dedab225d6e9353d))
* help and version exit 0, overlay reconnects over wss on https, deploy init reports an unwritable file ([ad73c02](https://github.com/LuigiDavideMicca/borgo/commit/ad73c021af12b450677e8b7145ddf0e0b702deb5))
* hop-by-hop request headers stop at the proxy instead of reaching go ([37097e9](https://github.com/LuigiDavideMicca/borgo/commit/37097e9b3de6daa3788d76c94ea6f39ef8786571))
* inline script json escapes u+2028/u+2029 alongside the angle bracket ([1316ebd](https://github.com/LuigiDavideMicca/borgo/commit/1316ebdefa6e9ebd0c81d0d6b741874f63e9f25e))
* precompression survives a file that vanished between the scan and the read ([26471c6](https://github.com/LuigiDavideMicca/borgo/commit/26471c6bca088fc052752f967173203c5df3c0df))
* production limits on the front server - api header deadline with 504, bounded request bodies, csrf reject before body parse, 405 carries allow, healthz probe memoized ([ee4f7c0](https://github.com/LuigiDavideMicca/borgo/commit/ee4f7c09073e5e0640b1676d3ae9a7b4a9d13c87))
* replay the saved scroll position on a back/forward full load ([ac6228e](https://github.com/LuigiDavideMicca/borgo/commit/ac6228e857df126070694b321fa6bbd2320e6158))
* runtime rejects script-scheme redirects and survives malformed action payloads ([761bec1](https://github.com/LuigiDavideMicca/borgo/commit/761bec1a385af25cf62166f8d2e0b18deb655b4a))
* ssr streams with backpressure, stops when the client goes away ([8c2b8f8](https://github.com/LuigiDavideMicca/borgo/commit/8c2b8f836640ca9b86da814814989cf3b98131b0))
* the browser's host stops deciding what go reads as its own ([16ec3a1](https://github.com/LuigiDavideMicca/borgo/commit/16ec3a1568c6d0a88fecd75d66aab318d1d226f7))
* the csrf registry can be cleared, so its bare-path test owns its state ([3698e89](https://github.com/LuigiDavideMicca/borgo/commit/3698e89253e354a69323fbae074eacd0523ec912))
* the port probe binds the wildcard, so a port the go api holds reads busy ([f7a0fb1](https://github.com/LuigiDavideMicca/borgo/commit/f7a0fb1ddcccd46acfec2fb1031d9357b3d867a6))
* the precache stamp folds in the bytes of the assets whose names never move ([ab334e8](https://github.com/LuigiDavideMicca/borgo/commit/ab334e8370bf2e7cf4e010c517179b844097f5c9))
* the server reads the csrf token like the browser does, ambiguity and all ([ab3c76f](https://github.com/LuigiDavideMicca/borgo/commit/ab3c76f551095cc23df0bd590a4deff5be6454ee))
* the whole dev and start tree dies with its parent, no more stale processes ([03a1fd5](https://github.com/LuigiDavideMicca/borgo/commit/03a1fd5b24600bc6eaef56b3e214bf4d2570c646))
* the ws and push endpoints answer with the security headers too ([272f749](https://github.com/LuigiDavideMicca/borgo/commit/272f749ab8df40ae3be90cd8542b10f35fff1cfe))
* unserializable props fail before the render, not after it ([81998d1](https://github.com/LuigiDavideMicca/borgo/commit/81998d1298ce6d28f6c4afb4c15ac3b43866b492))


### Performance Improvements

* hoist the ssr hot path's per-request string and route work to boot ([5e00b7c](https://github.com/LuigiDavideMicca/borgo/commit/5e00b7c2cb9fc79cc85433e6e92cd35d23124f72))
* index public/ at boot, serve assets with etags and 304s ([aa2a817](https://github.com/LuigiDavideMicca/borgo/commit/aa2a817abc98cf49903e00f745e6557e15229db9))
* scriptJson chains replaceAll instead of a regex callback pass ([3bb5156](https://github.com/LuigiDavideMicca/borgo/commit/3bb5156324aa07642c9a51c3997092ac7623fffe))


### Miscellaneous Chores

* cut the 0.20 release ([cd2503d](https://github.com/LuigiDavideMicca/borgo/commit/cd2503dd0ea7850f2f95c1b6cb4abdf0513a9b5f))

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
