# Root dependency audit: findings and remediation order

Investigation only. No dependency, lockfile or application file was changed, and
`npm audit fix` was not run. Data comes from `npm audit --json`, `npm ls` and the
production build's source map in the cloud container, on commit
`f4a633675372000ac4cacf8cb692eb92f55e3e07` (Windows reported the same 114 total).
`functions/` audits at 0.

## Headline
114 findings: 2 critical, 71 high, 38 moderate, 3 low. They are 22 packages with an
advisory of their own and 92 packages flagged because they depend on one.
**None of the vulnerable code is in the shipped browser bundle** (see below), so the
realistic exposure is the developer machine and the build, not the hosted site.

## Why `npm audit --omit=dev` shows the same 114
`react-scripts`, `typescript`, the testing libraries and the `@types/*` packages are
all listed under `dependencies`, which is the Create React App default. npm therefore
counts the whole toolchain as production (1,441 "prod" packages, 0 "dev"). The
audit's "production" number is not meaningful until that is changed.

## Direct dependencies involved
| Direct dependency | Findings it brings | Highest severity |
|---|---|---|
| `react-scripts@5.0.1` | 108 | critical |
| `@capacitor/cli@8.5.2` | 4 (3 moderate, 1 high; the high, `brace-expansion`, is shared with react-scripts) | high |
| `firebase@12.19.0` | 4 | high |

`react-scripts@5.0.1` is also the latest published version, so there is no newer
release to move to.

## The two critical findings (both under `react-scripts`, dev server / dev tooling)
| Package | Installed | Advisory | Path | Fix |
|---|---|---|---|---|
| `shell-quote` | 1.10.0 | GHSA-pqg4-j6r4-53mv, `quote()` command injection via a line terminator after a `{ comment }` token (CVSS 8.1, network, high complexity) | `react-scripts > react-dev-utils > shell-quote`; `react-scripts > webpack-dev-server > launch-editor > shell-quote` | Patched versions exist (latest 1.12.0). Both parents' ranges admit it (`^1.7.3`, `^1.10.0`), so a lockfile-only update is possible. |
| `proxy-addr` | 2.0.7 | GHSA-jqcg-44mw-7w3h, IP spoofing via IPv4-mapped IPv6 trust subnet (CVSS 9.1) | `react-scripts > webpack-dev-server > express@4.22.2 > proxy-addr` | 2.0.8 exists; express requires `~2.0.7`, which admits it. Lockfile-only update possible. |

Both are in the webpack dev server (`npm start`) or its helper libraries. Neither is
used by `npm run build` output or by the deployed site.

## The high findings (71)
Fourteen packages carry their own high advisory; the rest are propagation.
- **`react-scripts` root, build and dev tooling (67 high):**
  - Dev server: `webpack-dev-middleware` (path traversal), `follow-redirects` (credential header leaks), `launch-editor` (existence check bypass on Windows), `node-forge` (RSA signature verification), via `webpack-dev-server`.
  - Build time: `postcss` (arbitrary file read through `sourceMappingURL`), `svgo` (script removal bypass), `serialize-javascript` (RCE through `RegExp.flags`), `source-map-js`, `nth-check` and `braces` (denial of service), `underscore` (unbounded recursion), `brace-expansion` (denial of service).
  - Test tooling: the Jest family and `@typescript-eslint` packages are flagged by propagation.
- **`firebase` root (4 high):** `@grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, certificate authorisation context) is pinned `~1.9.0` by `@firebase/firestore`. The latest `@firebase/firestore` (4.19.0) pins the same range, so no Firebase upgrade fixes it today. The three other findings (`@firebase/firestore`, `@firebase/firestore-compat`, `firebase`) are the same issue propagated.
- **`@capacitor/cli` root:** `brace-expansion` through `rimraf > glob > minimatch`, a build tool for the Android wrapper.

## Production runtime versus tooling
The production build's source map lists 17 packages in the shipped browser bundle:
`@capacitor/core`, `@firebase/*` (app, auth, component, firestore, logger, util),
`@revenuecat/purchases-js`, `firebase`, `idb`, `re2js`, `react`, `react-dom`,
`scheduler`, `web-vitals` and `zustand`. Of the 114 flagged names, only `firebase` and
`@firebase/firestore` appear there, and they are flagged only because of their
declared `@grpc/grpc-js` dependency, which is **not** in the bundle (the web build
uses WebChannel). So:
- **Hosted browser bundle:** no vulnerable code identified.
- **Cloud Function:** separate package with 0 findings.
- **Developer machine / CI:** all 108 `react-scripts` and 4 Capacitor findings, relevant when running `npm start`, `npm test` or `npm run build` on untrusted input or untrusted networks.
- **Android wrapper build (Capacitor CLI):** tooling, developer machine only.

## Which findings have a real fix
| Class | Count | Meaning |
|---|---|---|
| Non-breaking (`npm audit fix` within existing ranges) | 76 (2 critical, 44 high, 27 moderate, 3 low) | Lockfile-level updates; includes both criticals. |
| Only via `react-scripts` (npm suggests `0.0.0`) | 32 (23 high, 9 moderate) | No real fix: parent packages pin vulnerable ranges (for example `postcss`, `node-forge`, `nth-check`, `braces`, `webpack-dev-middleware`, `svgo`). Needs overrides or leaving react-scripts. |
| Suggested "downgrade" | 6 (4 high firebase, 2 moderate `@capacitor/cli`) | Not real fixes: npm proposes `firebase@9.14.0` and `@capacitor/cli@8.4.3`. Do not follow them. |

## Uncertainty
- Audit metadata shows affected version ranges, not whether this project can be exploited. Severity scores are the advisories' own.
- The source-map check covers the JavaScript bundle only. It cannot see what the Android wrapper or any CI environment pulls in.
- "Dev-only" is inferred from dependency paths and the bundle contents, not from running an exploit or tracing every call.
- Whether lockfile updates break the verified build is untested; they have not been applied.
- `launch-editor`'s Windows advisory touches the dev server's open-in-editor feature, which is relevant on your Windows machine; whether it is reachable depends on how `npm start` is exposed.

## Recommended remediation order
1. **Now, before the October 30 deadline: change no dependencies.** The verified build on both platforms is worth more than clearing dev-time findings. Mitigate operationally: run the dev server on localhost only (`HOST=localhost`), do not expose it to other networks, and do not run builds on untrusted CSS or SVG.
2. **First change afterwards, targeted and lockfile-only:** update `shell-quote` and `proxy-addr` (the criticals), then `follow-redirects`, `launch-editor`, `underscore` and `source-map-js`. Rebuild and run all tests on Windows and Linux before keeping it. Prefer targeted `npm update <package>` over a blanket `npm audit fix`.
3. **Then the rest of the 76 non-breaking fixes** in one reviewed lockfile change, with the same checks.
4. **Manifest hygiene:** move `react-scripts`, `typescript`, the testing libraries and `@types/*` to `devDependencies` so the production audit becomes meaningful. First confirm the hosting build does not install with dev dependencies omitted, or it will fail.
5. **The 32 react-scripts-pinned findings:** accept and document, or add narrowly scoped `overrides` for individual packages, each verified by a full build. All are dev-time.
6. **Firebase `@grpc/grpc-js`:** wait for a Firebase release that raises the pin. Do not downgrade Firebase. The browser bundle does not include it.
7. **`@capacitor/cli`:** try 8.5.3 when building the Android wrapper; its declared dependency ranges look unchanged, so it may not clear the findings.
8. **After the hackathon:** plan a move off Create React App (for example to Vite), the only durable way to clear the react-scripts group.
