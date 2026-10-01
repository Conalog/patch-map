# Shared package assets

`shared/assets/` owns the committed SVG icons, Fira Code font payloads, license
and native-font provenance. JavaScript and Flutter publication artifacts are
self-contained; consumers do not need the repository or its preparation tools.

## Sources and outputs

| Input | JavaScript | Flutter |
| --- | --- | --- |
| `shared/assets/icons/*.svg` | imported directly as raw SVG into library chunks | generated `assets/icons/` |
| `shared/assets/fonts/FiraCode-VF.woff2` | emitted as WOFF2 and a lazy data-URL module | generated `assets/fonts/FiraCode-VF.woff2` |
| `shared/assets/fonts/FiraCode-VF.ttf` | unused | generated native font |
| `shared/assets/fonts/LICENSE.txt` | generated `packages/javascript/docs/assets/fira-code-6.2-license.txt` | generated font license |
| `shared/assets/fonts/provenance.json` | unused | generated native-font provenance |

WOFF2 and TTF are intentional distribution formats, not package-local copies.
The TTF is preconverted; preparation does not run font conversion. Provenance
pins the source and native hashes, conversion tool and verified font properties.
Changing either font requires updating and reviewing that record.

`verification/assets/prepare.mjs` owns the reviewed inventory, source checks and
output preparation. Generated Flutter assets and the JavaScript license copy
are ignored by Git. Only their canonical inputs and tooling are committed.

## Local development and packaging

From the repository root, using Node 22:

```sh
npm run assets:prepare                 # both packages
npm run assets:prepare -- flutter      # Flutter only
npm run assets:prepare -- javascript   # npm license only
```

JavaScript's build/prepack prepares the license and reads SVG/font sources
directly. Source tests and development servers do not need copied resources.
Flutter's repository analyze/test/package commands prepare assets before pub
resolution and before creating the alternate-SDK example copy. Native host CI
and Dart candidate CI prepare them before their direct Flutter commands.

When invoking Flutter directly, including a checkout used as a path dependency,
run preparation before the first pub/test/run/build command and after changing
canonical assets. Preparation is synchronous, skips byte-identical outputs and
removes stale files only inside the wholly generated Flutter `assets/` tree.
Do not edit generated copies. No background synchronization or committed copies
are required.

Pub's package-local `.pubignore` and npm's explicit file allowlist include the
generated resources. The installed-consumer gates check actual artifact bytes
and loading. Registry publication extracts the previously qualified artifact;
it does not regenerate resources after qualification.

## Change routing and verification

Shared sources and preparation tooling select both package CI gates. Release
planning routes shared SVG, WOFF2, license and preparation changes to both
package histories before applying each package's published SHA boundary. Native
TTF/provenance-only changes affect Dart releases. Version and registry operations
remain [independent](releases.md).

Source evidence fingerprints include canonical assets and preparation tooling,
excluding generated copies. Artifact hashes separately bind the prepared bytes.
Native build receipts additionally require actual prepared asset hashes matching
canonical bytes; the [evidence collector](../../verification/conformance/collect-evidence.md)
provides a native snapshot command that rejects stale copies.
Canonical input or generator changes invalidate evidence; merely preparing an
unchanged checkout does not change its source identity.

Run `node --test verification/assets/*.test.mjs` for preparation, inventory,
drift and symlink checks. Asset-path changes also require the focused JavaScript
asset tests, npm installed-artifact gate and Flutter installed-consumer gate on
both SDK roles; native workflow changes require host builds. Follow
[verification policy](verification.md) for other changed risks.
