# Changelog

## [0.20.0](https://github.com/LuigiDavideMicca/borgo/compare/create-borgo-v0.11.0...create-borgo-v0.20.0) (2026-07-31)


### Features

* create-borgo asks about tailwind and scaffolds it wired ([c1e41d9](https://github.com/LuigiDavideMicca/borgo/commit/c1e41d9b65d52cf9d1688bbbdf8f6ebf990dfd28))
* three create-borgo templates (minimal, base, full) with cli selection ([0b88680](https://github.com/LuigiDavideMicca/borgo/commit/0b8868065e8c2657382514f66bd43c3207d768de))


### Miscellaneous Chores

* cut the 0.20 release ([cd2503d](https://github.com/LuigiDavideMicca/borgo/commit/cd2503dd0ea7850f2f95c1b6cb4abdf0513a9b5f))

## [0.11.0](https://github.com/LuigiDavideMicca/borgo/compare/create-borgo-v0.10.1...create-borgo-v0.11.0) (2026-07-30)


### Features

* hardened http server with timeout env overrides and a 1 mb bind cap answering 413 end to end ([f1230aa](https://github.com/LuigiDavideMicca/borgo/commit/f1230aaa838192f82e2ac328f6b17c24c01880e4))
* systematic auth, borgo.Auth handlers over stdlib pbkdf2, Authed middleware and csrf-protected actions ([304b144](https://github.com/LuigiDavideMicca/borgo/commit/304b144ba275e738e1418ca4ac58fddbdef0f932))
* typed websocket events, borgo.PushT feeds a generated event map that types subscribe ([3eaad62](https://github.com/LuigiDavideMicca/borgo/commit/3eaad62964d6b638fda2a79297a9f1cde3757c51))


### Bug Fixes

* scaffold stamps the released borgo-framework version, template form carries the csrf field ([652d573](https://github.com/LuigiDavideMicca/borgo/commit/652d57376a8d47cb8731ad850af07c909f39ba9e))

## [0.10.0](https://github.com/LuigiDavideMicca/borgo/compare/create-borgo-v0.9.1...create-borgo-v0.10.0) (2026-07-29)


### Features

* add the create-borgo scaffolding cli ([7eb5fcc](https://github.com/LuigiDavideMicca/borgo/commit/7eb5fcc8deb4911a4cdafac950a9a04351ac02bc))
* attribution on template landing, readme and cli output ([03c620d](https://github.com/LuigiDavideMicca/borgo/commit/03c620daffe7982aa7356f1799968b8d4fa41fbb))
* branded cli and server output ([8906f7e](https://github.com/LuigiDavideMicca/borgo/commit/8906f7eb7fc235ab19b7ce7dd3690a7fbfd60c36))
* complete the typed bridge - helpers, writejson, type overrides, typed request bodies ([d9471ee](https://github.com/LuigiDavideMicca/borgo/commit/d9471eef83e524ba0ea5d97ca2349374db168198))
* deploy story - dockerfiles, compose, deploy guide, split-mode start ([6bc02d6](https://github.com/LuigiDavideMicca/borgo/commit/6bc02d632a0dff0af48f869ede2bcbabfad90c38))
* first-class server-sent events ([dd0b714](https://github.com/LuigiDavideMicca/borgo/commit/dd0b7140cb71f096dfadb4d31fa0a4778d7e8db9))
* per-page code splitting with lazy route chunks ([454493b](https://github.com/LuigiDavideMicca/borgo/commit/454493bea3b88f33540b850d9f51ab87536d4469))
* route directives replace init boilerplate ([82f891e](https://github.com/LuigiDavideMicca/borgo/commit/82f891ed051895d340fdbe7265772535ea726234))
* the borgo logo and a branded template ([dca83d6](https://github.com/LuigiDavideMicca/borgo/commit/dca83d667e1876f360658c7e80b14be01765284c))
* typed go-to-ts bridge via borgogen ([eef2c27](https://github.com/LuigiDavideMicca/borgo/commit/eef2c27b18786c3117fcc8382c40bfe1a54e591e))


### Bug Fixes

* document the bun shim path failure and the safe ways around it ([f6404d0](https://github.com/LuigiDavideMicca/borgo/commit/f6404d039255befde493e109dfe29a11ae1befd1))
* fall back to ascii marks on legacy windows consoles ([f4ef03d](https://github.com/LuigiDavideMicca/borgo/commit/f4ef03dd95ccd6187b56a8746e350bbe4bce0100))
* include generated api types in the ts program ([9046b25](https://github.com/LuigiDavideMicca/borgo/commit/9046b25debb65bf152ae8ccd14bb790d3aedeeeb))
* publish the runtime as borgo-framework, npm rejects the short name ([1c8d5ca](https://github.com/LuigiDavideMicca/borgo/commit/1c8d5caa7128fc3eb137715d91eb14edccb46d0d))
* scaffold ships pregenerated api types so the client is typed before the first dev run ([03b8dca](https://github.com/LuigiDavideMicca/borgo/commit/03b8dca5bb922b34aa06f76d93560357688cc777))
* treat piped windows output as legacy too, powershell decodes it as ansi ([a9450df](https://github.com/LuigiDavideMicca/borgo/commit/a9450df0684907b1ab68c5e9a1718be66c8837b4))

## 0.9.0 (2026-07-29)


### Features

* add the create-borgo scaffolding cli ([7eb5fcc](https://github.com/LuigiDavideMicca/borgo/commit/7eb5fcc8deb4911a4cdafac950a9a04351ac02bc))
* attribution on template landing, readme and cli output ([03c620d](https://github.com/LuigiDavideMicca/borgo/commit/03c620daffe7982aa7356f1799968b8d4fa41fbb))
* branded cli and server output ([8906f7e](https://github.com/LuigiDavideMicca/borgo/commit/8906f7eb7fc235ab19b7ce7dd3690a7fbfd60c36))
* complete the typed bridge - helpers, writejson, type overrides, typed request bodies ([d9471ee](https://github.com/LuigiDavideMicca/borgo/commit/d9471eef83e524ba0ea5d97ca2349374db168198))
* deploy story - dockerfiles, compose, deploy guide, split-mode start ([6bc02d6](https://github.com/LuigiDavideMicca/borgo/commit/6bc02d632a0dff0af48f869ede2bcbabfad90c38))
* first-class server-sent events ([dd0b714](https://github.com/LuigiDavideMicca/borgo/commit/dd0b7140cb71f096dfadb4d31fa0a4778d7e8db9))
* per-page code splitting with lazy route chunks ([454493b](https://github.com/LuigiDavideMicca/borgo/commit/454493bea3b88f33540b850d9f51ab87536d4469))
* route directives replace init boilerplate ([82f891e](https://github.com/LuigiDavideMicca/borgo/commit/82f891ed051895d340fdbe7265772535ea726234))
* the borgo logo and a branded template ([dca83d6](https://github.com/LuigiDavideMicca/borgo/commit/dca83d667e1876f360658c7e80b14be01765284c))
* typed go-to-ts bridge via borgogen ([eef2c27](https://github.com/LuigiDavideMicca/borgo/commit/eef2c27b18786c3117fcc8382c40bfe1a54e591e))


### Bug Fixes

* include generated api types in the ts program ([9046b25](https://github.com/LuigiDavideMicca/borgo/commit/9046b25debb65bf152ae8ccd14bb790d3aedeeeb))
