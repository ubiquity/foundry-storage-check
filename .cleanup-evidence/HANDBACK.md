# HANDBACK — 015-implement-foundry: `@actions/artifact` client/runtime port (ready-unvalidated)

Status: **ready-unvalidated**. Edits and dependency install are complete; `yarn build` / `yarn release` / `yarn test` were deliberately NOT run in this lane. `dist/` is still the stale pre-change build. Treat this as ready for primary mechanical relay, never as complete.

## 1. Identity and lane

| Field | Value |
| --- | --- |
| Worker | `015-implement-foundry` (DeepSeek execution legwork, `deepseek-flash`) |
| Actual first pwd | `/Users/nv/repos/ubiquity/foundry-storage-check/.codex-worktrees/plan-m-foundry-artifacts-a0230e74eea` (matches assignment) |
| Git root | same path (worktree root) |
| Branch | `codex/plan-m-foundry-artifacts-a0230e74eea` (matches expected) |
| Base HEAD | `bca47ba7b0f04595f2d3bd9cd8c3f0886fc1ed11` (matches expected; `main` clean and separate) |
| Worktrees | exactly two: canonical `main` @ `bca47ba`, this lane @ `bca47ba` |
| Git mutations | none — no commit, push, branch, worktree, or PR action |
| Children / background jobs | none |

Reference revisions read in full this session, all hash-matched to the assignment: `deepseek-harness.md` `0858b860…`, `git-coordination.md` `028bcc0e…`, `test-evidence.md` `db26c20c…`, `research.md` `d9008130…`. No `AGENTS.md`, `DECISIONS.md`, or `docs/DECISIONS.md` exists in this repository (confirms the review finding); guidance therefore came from `pr-cleanup-2026/reviews/foundry-storage-check/DECISION.md`.

## 2. Decision: `@actions/artifact` `^1.1.1` → `^5.0.3`

Determined from official registry metadata and package-authored declarations, not from `DECISION.md`'s recommendation.

Complete published version list (registry, verified): `…1.1.2, 1.1.3, 2.0.0 … 2.3.2, 4.0.0, 5.0.0, 5.0.1, 5.0.2, 5.0.3, 6.0.0, 6.1.0, 6.2.0, 6.2.1`. Dist-tags are `latest = 6.2.1`, `v1-longlived = 1.1.3`. There is no `3.x`.

The CJS/ESM boundary is **6.0.0**, not 2.x — this is the load-bearing correction to `DECISION.md`'s framing:

| Version | `type` | `exports` | Module system |
| --- | --- | --- | --- |
| 2.3.2 | absent | absent | CJS (`main: lib/artifact.js`) |
| 4.0.0 | absent | absent | CJS |
| 5.0.3 | absent | absent | CJS |
| 6.0.0 | `module` | `{".":{"types":…,"import":…}}` | ESM, import-only |

So the newest **supported CJS** release is `5.0.3`, and `^5.0.3` needs no module-system rewrite. The ESM blocker the assignment anticipated does not apply because a supported CJS option exists.

Why 5.x rather than the upstream-shaped `^2.1.11` (which `DECISION.md` §2A recommended):

- `actions/upload-artifact@v6.0.0` — a currently-shipping official action — is CJS, declares `engines.node >= 24`, and depends on `@actions/artifact ^5.0.0`. `@actions/artifact@5.0.0` was published 2025-12-11, one day before `v6.0.0`. 5.x is therefore the artifact-client generation paired with the `node24` runtime this action must now declare.
- `actions/upload-artifact@v6.0.0` shipped PR [#744](https://github.com/actions/upload-artifact/pull/744), "fix: update `@actions/artifact` for Node.js 24 punycode deprecation", which moved `@azure/storage-blob` to `^12.29.1` so it uses `@azure/core-rest-pipeline` instead of the deprecated `@azure/core-http`. The 2.x line still pulls `@azure/core-http`; 5.0.3 does not.
- `actions/upload-artifact@v3.2.2` (artifact `1.1.3`) is explicitly marked "**deprecated on github.com and should not be used!**", confirming the 1.x generation is the retired one. Nothing deprecates the 4/5/6/7 lines.
- The official action bundles this exact graph with `@vercel/ncc ^0.36`, the same bundler major this repo already pins (`^0.36.1`).
- `^2.1.11` is the Node-20-era client; adopting it for a `node24` action would be an unnecessary pinning of an older generation, which the assignment directed against.

Risk of the choice is low and reversible: **the required `src/index.ts` change is byte-identical for 2.x and 5.x** (§3), so a version reconsideration is a one-line `package.json` edit plus a lockfile refresh.

## 3. Corrected API facts — `DECISION.md` §2A is wrong on both response fields

`DECISION.md` §2A states that v2 keeps `{ continueOnError: false }` semantics and that "`failedItems` remains meaningful" while "`artifactName` is no longer returned". Verified against the package-authored `.d.ts` shipped inside the real tarballs, that is false, and it is false for the **entire v2+ line**, not just 5.x:

- `UploadArtifactOptions` = `{ retentionDays?: number; compressionLevel?: number }`. **No `continueOnError`.** (identical in 2.3.2 and 5.0.3)
- `UploadArtifactResponse` = `{ size?: number; id?: number; digest?: string }`. **No `failedItems`, no `artifactName`.** (identical in 2.3.2 and 5.0.3)
- `create()` does not exist in v2+; the exports are `DefaultArtifactClient` (named) and a default client instance.

Documented and code-verified failure behaviour, used instead of invented fields: `uploadArtifact` **rejects** on every failure path. Real throw sites read from `lib/internal/upload/upload-artifact.js` and `blob-upload.js`: `FilesNotFoundError` (no files matched), `InvalidResponseError('CreateArtifact: response from backend was not ok')`, `InvalidResponseError('FinalizeArtifact: response from backend was not ok')`, `NetworkError` (blob upload), plus rethrow of the underlying error. `grep` for `failedItems` across the shipped 5.0.3 upload path returns nothing. There is no partial-success state to inspect, so fail-hard behaviour is preserved by the library itself and the removed `failedItems` guard has no replacement — correctly, since inventing one would test a non-existent field.

Protocol evidence that this actually addresses the `#992` incompatibility class: 5.0.3 issues `CreateArtifact` with `version: 4` over the twirp results API, replacing the retired legacy endpoint `_apis/pipelines/workflows/${runId}/artifacts?api-version=…` that the committed `dist/index.js` still contains. Client-side name validation is the same invalid-character set as v1 with **no length bound** (`lib/internal/upload/path-and-artifact-name-validation.js`), which independently re-confirms `DECISION.md` §3's rejection of the sanitization theory for this client too.

## 4. Changed paths (all within owned scope)

Exact diff: 4 files, 999 insertions, 45 deletions (`yarn.lock` accounts for 990/32 of it).

| Path | Change | sha256 |
| --- | --- | --- |
| `src/index.ts` | import `{ DefaultArtifactClient }`; `artifact.create()` → `new DefaultArtifactClient()`; upload call ported | `814816a8f8825b7adcbf0382da7881685cd57b15e106b2d82f900308b9735b5c` |
| `package.json` | `"@actions/artifact": "^1.1.1"` → `"^5.0.3"` (only change) | `90e905d8054cfebb09617b90f0595467ee79f2330c49a50240c06474e5fc9ea7` |
| `action.yml` | `using: node16` → `using: node24` (only change) | `8d68dc6085ba556ef776b91a56fa569a7c6b623b58d8a05e82cf7046a5749505` |
| `yarn.lock` | artifact 5.0.3 graph added; artifact 1.1.1 chain removed | `04b675597b76a6a4bfff994d6d9eeace69120cb6358f5d68db9b3f3bf0daed45` |

`src/index.ts` lines 55–61 now read:

```ts
  core.startGroup(`Upload new report from "${localReportPath}" as artifact named "${outReport}"`);
  // The artifact client rejects the returned promise on any upload failure, so a
  // failed upload still fails the step. There is no partial-success result to inspect:
  // v2+ returns only { size, id, digest } and no longer accepts `continueOnError`.
  await artifactClient.uploadArtifact(outReport, [localReportPath], dirname(localReportPath));

  core.info(`Artifact ${outReport} has been successfully uploaded!`);
```

The success log substitutes the known input name `outReport` for the removed `artifactName` field, so the emitted text is unchanged and no response field is invented. The original `failedItems` check was deleted because the field does not exist; `await` without a try/catch preserves fail-hard because the client rejects.

Fork behaviour explicitly preserved and untouched by the diff: `getReportPath` derivation and therefore exact artifact names; `baseReport` lookup over `octokit.paginate.iterator(octokit.rest.actions.listArtifactsForRepo)` including the `!artifact.expired && artifact.name === baseReport` predicate and the 800 ms rate-limit delay; `throw Error('No workflow run found with an artifact named "${baseReport}"')` on a missing existing-contract base artifact; the `failOnLabelDiff` input, its `action.yml` declaration, and its failure condition; `failOnRemoval`; `refCommitHash`; the `dist/index.js` entrypoint. No sanitizer, no renaming, no hash, no legacy fallback, no new-contract skipping, no env vars/flags, no migrations.

`yarn.lock` delta was inspected line-by-line: every removed line belongs to the `@actions/artifact@1.1.1` chain (`tmp`, `tmp-promise`, `rimraf`, and the `@actions/core ^1.9.1` key fragment). No unrelated package was re-resolved or bumped.

## 5. Commands actually executed in this lane

| Command | Result |
| --- | --- |
| `npm view @actions/artifact versions --cache <lane>/.cleanup-evidence/npm-cache` | exit 0 — full version list above. (Plain `npm view` first failed `EPERM` on a root-owned host `~/.npm/_cacache`; used an isolated lane cache instead. The host npm cache was NOT repaired or modified.) |
| `curl` registry tarballs + `tar -x` for `@actions/artifact` 5.0.3 and 2.3.2 | exit 0 — real `.d.ts`/`.js` read for §3; extracted under `.cleanup-evidence/` only |
| `COREPACK_HOME=<lane>/.cleanup-evidence/corepack corepack yarn --version` | exit 0 — `1.22.22`, matching the repo's yarn-v1 lockfile format, with no `corepack enable` and no host toolchain change |
| `NODE_ENV=development corepack yarn install --production=false --ignore-scripts --non-interactive` | exit 0 — `success Saved lockfile`, 24.20 s |
| `./node_modules/.bin/prettier --check src/index.ts` | **exit 1 — pre-existing failure, see §6** |
| `git diff`, `git status --short`, `shasum` | inspection only |

Install notes. `--ignore-scripts` was used per the assignment; no dependency in this graph requires a native or postinstall build step, and the primary's build/package relay is the check on that. Two warnings appeared, neither attributable to the 5.x choice: `@actions/artifact > archiver > archiver-utils > glob@10.5.0` deprecation notice (identical in 2.x, which pins the same `archiver ^7.0.1`), and `bare-fs@4.8.1: The engine "bare" appears to be invalid` (arrives via `archiver ^7.0.1 → tar-stream@3.2.1`, also identical in 2.x; the official `upload-artifact@v6` bundles this same graph with the same ncc major). No secrets, credentials, or production env values were read, copied, or passed; validation so far has been credential-free.

**Trap worth recording for the relay:** this lane inherits `NODE_ENV=production` from the DSH launch, and yarn 1 honours it by silently omitting `devDependencies`. The first `yarn install` therefore produced a `node_modules` with no `prettier`, `jest`, or `@vercel/ncc`, which would have broken the primary's `yarn release`. `NODE_ENV=development` + `--production=false` for that one command fixed it; `node_modules` now contains `prettier`, `jest`, `ts-jest`, `@vercel/ncc`, `typescript`, `adm-zip`, and `colors`. `NODE_ENV` was never exported shell-wide and the lockfile content was unaffected.

## 6. Unresolved constraints, risks, and known-bad inputs

1. **`dist/` is stale and NOT regenerated.** The assignment's validation boundary reserves packaging for the primary relay, so this lane intentionally stopped before it. `dist/index.js` (sha256 `b831b821d50091f7b111203c03d4350cd8f2589c3082c7d78da0e51fe31b96b6`) still contains the retired `_apis/pipelines/workflows` endpoint, so **the action is not fixed until `yarn release` runs and its output is incorporated.** Do not read anything into a zero-diff check against this stale `dist/`.
2. **`yarn` is not on this host's PATH.** `command -v yarn` exits 127; the nvm bin directory contains `corepack, dsh, dtui, node, npm, npx` and no `yarn`. Plain `corepack yarn --version` exits 0 with the default environment. The registered argv `["yarn","build"]` / `["yarn","release"]` will therefore fail to spawn unless a `yarn` shim exists outside this sandbox or the registration is changed to prefix `corepack`. This is the single most likely relay failure; §7 gives both forms.
3. **`yarn format:check` cannot pass on this change, for pre-existing reasons.** `prettier --check src/index.ts` fails at HEAD too, with exactly one deviation — the `failOnLabelDiff` condition at (HEAD) lines 155–156, which prettier wants joined onto one line. That code is untouched by this port. I diffed prettier's normalized output of HEAD against prettier's normalized output of the current file: the only differences are my intended semantic edits, so **my added lines introduce no new deviation**. I deliberately did not run `prettier --write`, because it would reformat untouched `failOnLabelDiff` fork behaviour and add unrelated diff noise; that is a scope decision for the primary, not a silent cleanup.
4. **`package.json` `engines.node` still says `>=12.0.0`** while `action.yml` now declares `node24`. This is a genuine self-contradiction, but `engines` was not in the authorized change set and has no runtime effect on the action (the runner supplies the interpreter). Flagged rather than silently changed.
5. **`node24` operational requirement (inherited from the official action's own guidance):** self-hosted runners need Actions Runner >= 2.327.1. `actions/upload-artifact@v6.0.0` publishes the same constraint for the same runtime change.
6. **Runtime env requirement, expected but unverified here:** the v4+ artifact service needs `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RESULTS_URL`, which the runner injects for JavaScript actions. This was not exercised — it can only be proven on a runner.
7. **`.cleanup-evidence/` is untracked, not gitignored** (`git status` shows `?? .cleanup-evidence/`). `.gitignore` is outside my writable scope, so I did not add an ignore rule. Primary must not stage this directory.
8. **No test was added, deliberately.** The allowed "focused test" would have to assert that a third-party library throws, which mirrors the dependency rather than this repo's logic, and testing `src/index.ts` at all requires new mocking infrastructure for `@actions/core` inputs — the assignment prohibits new frameworks and broad abstractions. The real acceptance surface remains a GitHub runner artifact upload.

## 7. Requested primary relay (exact commands)

Registered evidence targets from this lane: `pr-cleanup-foundry-build => [yarn, build]`, `pr-cleanup-foundry-package => [yarn, release]`. This lane cannot execute them (the notifications worker cannot create the shared evidence-tool lock in `~/.local/state/dsh-evidence`), and it did not retry that denial or widen permissions.

Run in order, from `/Users/nv/repos/ubiquity/foundry-storage-check/.codex-worktrees/plan-m-foundry-artifacts-a0230e74eea`, one capture each, stopping on failure:

1. `corepack yarn build` (`rm -rf lib && tsc --build ./tsconfig.build.json`) — the API/type proof for the `DefaultArtifactClient` port, and the first real compile of `src/index.ts`. If the registration must keep the literal `yarn` binary, either prefix `corepack` in the definition or confirm a host `yarn` shim exists; do not assume it does.
2. Only after (1) exits 0: `corepack yarn release` (`yarn build && ncc build --source-map --license licenses.txt`) — authorized one-pass mutation of `dist/**`. This is what removes the legacy endpoint from the shipped bundle.
3. Post-build assertions worth capturing as the artifact of record: `grep -c "_apis/pipelines/workflows" dist/index.js` should now be `0`, and `grep -c "DefaultArtifactClient" dist/index.js` should be `> 0`.
4. Reproducibility, only after the regenerated `dist/` is incorporated, and only as the single justified second run: re-run the `release` target and require `git diff --exit-code --ignore-space-at-eol --text dist/` to be `0` — the repo's own `.github/workflows/check-dist.yml` gate. It is meaningless before step 2's output is in place.
5. Optional, and not a gate for this change: `corepack yarn format:check` will fail on the pre-existing deviation described in §6.3; compare against HEAD before attributing it to this port.

Acceptance limits to preserve in any report. Local compile and packaging prove only that the client compiles and bundles. They do **not** prove `ubiquity/ubiquity-dollar#992` is fixed: that needs a real workflow run that actually executes the `check_storage_layout` job and successfully uploads the artifact and resolves the base-artifact lookup. Note that consumer run #445 was green while skipping `check_storage_layout` entirely, so a green conclusion alone proves nothing, and `#992` must not be closed on compilation evidence.

## 8. Attribution

Port intent credited to `saimuren`'s PR #3 (per `DECISION.md` §2A and §6) and to official upstream `actions/toolkit` / `actions/upload-artifact`; no public comment or PR action was taken, and PR #3's diff was not applied wholesale. This lane changed only the three existing call sites plus the manifest, runtime declaration, lockfile, and (by relay) `dist/`. Nothing here needs outbound communication.
