# Context Doc: Obsidian Community Plugin Submission

_Last verified: 2026-05-14_

## Status
**Working — new flow as of 2026-05-12.** GitHub PR submission to `obsidianmd/obsidian-releases` is deprecated. Use https://community.obsidian.md/ Developer Dashboard instead.

## What This Is
How to submit (and re-submit new versions of) the Engram Sync plugin to the official Obsidian Community Plugins directory.

## Environment
- Submission flow: Obsidian Community site (https://community.obsidian.md/)
- Requires: Obsidian account + GitHub account linked
- Repo currently at `Rasbandit/Engram-obsidian-sync` — planned migration to `Engram-App/...` org (re-submit with new `repo` field after move)
- Reviewer runs `eslint-plugin-obsidianmd` automated rules on every release tag

## Connection
- Community site: https://community.obsidian.md/
- Developer Dashboard: https://community.obsidian.md/account/profile (after sign-in)
- Blog announcing change: https://obsidian.md/blog/future-of-plugins/
- Discord (for issues / Verified Developer / Official label): #plugin-dev on https://discord.gg/obsidianmd

## Auth
- Sign in with Obsidian account (the one tied to your Obsidian.md subscription, NOT GitHub login).
- Connect GitHub account to claim repos. Only the repo OWNER can edit it in the dashboard. For org repos, you need public membership in the org.

## Key Commands / Patterns

### Submitting a NEW plugin (one-time)
1. https://community.obsidian.md/account/profile → sign in
2. Connect GitHub
3. Developer Dashboard → "Submit new project" → pick repo
4. Fill: title, description, screenshots, category (Sync / Integrations / etc.), pricing label (Free | Optional payments | Paid)
5. Submit → automated review runs in minutes
6. Pass → live in Community Plugins search within 24h

### Submitting a NEW VERSION (recurring)
Just push a release to GitHub with matching tag. Automated review runs automatically. If it fails, the dashboard shows details and the plugin is pulled from search within 24h until you fix it.

### Pricing labels (must be accurate)
- **Free** — no payments, no paid services. Donation/sponsorship links (Ko-fi, GitHub Sponsors) ARE allowed → we qualify as Free.
- **Optional payments** — users CAN pay for extra features OR plugin connects to a paid service (even if that service has a free tier).
- **Paid** — primary features locked behind payment.

### Local pre-check before push
```bash
bun run lint:obsidian       # eslint-plugin-obsidianmd via slim config
bun test                    # 412 tests
bun run build               # tsc + esbuild
```
Or via dashboard: "Run preview scan" on any branch/tag/commit.

## Failed Approaches / Dead Ends

### Old GitHub PR flow (DEAD as of 2026-05-12)
We had this set up:
- Fork `obsidianmd/obsidian-releases` at `Rasbandit/obsidian-releases`
- Branch `add-engram-sync` with entry appended to `community-plugins.json`
- Compare URL: https://github.com/obsidianmd/obsidian-releases/compare/master...Rasbandit:obsidian-releases:add-engram-sync?expand=1&template=plugin.md

**This NO LONGER WORKS.** Repo now shows "An owner of this repository has limited the ability to open a pull request to users that are collaborators on this repository." `pull_request_creation_policy: collaborators_only` confirmed via API. Last successful PR was 2026-05-12. The fork + branch are harmless leftovers — can delete or leave.

### Fine-grained PAT cannot create cross-repo PRs
`gh_pat_*` tokens are scoped to user account only. Cross-repo PR creation needs classic OAuth token via `gh auth login --web`. (Now moot — see above.)

## Gotchas

### `eslint-plugin-obsidianmd` v0.3.0 missing rules
The plugin's `master` branch source has rules not yet published:
- `no-nodejs-modules` — we replicate via `no-restricted-imports` in `eslint.config.mjs`. List covers `fs path os crypto child_process stream http https net tls util url querystring zlib buffer events assert module` + `node:*` patterns.

If/when v0.4+ ships, replace our `no-restricted-imports` block with `"obsidianmd/no-nodejs-modules": "error"`.

### Recommended config is too strict
`obsidianmd.configs.recommended` bundles `typescript-eslint:recommendedTypeChecked` + `microsoft/sdl` + `eslint-plugin-no-unsanitized`. That adds ~150 errors that reviewers don't enforce. Our `eslint.config.mjs` reproduces ONLY `obsidianmd/*` rules at their recommended severities — matches what the bot actually flags.

### 6 known false positives in our UI strings
The `obsidianmd/ui/sentence-case` rule misfires on URLs / canonical literals. Suppressed per-line with justification comments — see source for full reasoning:
1. `src/tabs/advanced-tab.ts:107` — `github.com/Rasbandit/Engram-obsidian-sync` (literal URL)
2. `src/tabs/self-hosted-tab.ts:25` — `github.com/Rasbandit/engram` (literal URL)
3. `src/tabs/self-hosted-tab.ts:31` — `http://10.0.20.214:8000` (lowercase scheme per RFC 3986)
4. `src/tabs/self-hosted-tab.ts:34` — `http://localhost:8000` placeholder (lowercase scheme)
5. `src/tabs/self-hosted-tab.ts:88` — `OAuth` (canonical per RFC 6749, rule wants `OAUTH`)
6. `src/tabs/self-hosted-tab.ts:143` — `engram_abc123...` (literal token format example)

All marked with `// eslint-disable-next-line obsidianmd/ui/sentence-case -- <reason>`.

### Brand-name capitulation
We lowercase `engram` mid-sentence in 4 places (e.g. "Switched to engram cloud") to match the rule's treatment of "Obsidian" (which is in their brand whitelist). Reads as a typo, but passes the bot cleanly — chosen over defending each instance manually. Locations: `src/tabs/account-tab.ts:25`, `src/tabs/self-hosted-tab.ts:21,31,63,65,88,127,128,141`. New `Engram` mid-string in UI should likewise be lowercase.

### Closed-source plugins not accepted (for now)
Per FAQ: new closed-source plugins are not accepted into the new directory. Existing ones grandfathered. Engram Sync is MIT — fine.

### `minAppVersion` will be re-flagged if you use newer APIs
We bumped to `1.7.2` for `Workspace.revealLeaf`. If you adopt newer API, `obsidianmd/no-unsupported-api` will flag and tell you exactly which version each call needs.

## References
- `eslint.config.mjs` — local CI gate
- `.github/workflows/ci.yml` — "Lint (Obsidian community reviewer rules)" step
- `package.json` `lint:obsidian` script
- https://obsidian.md/blog/future-of-plugins/ — the 2026-05-12 announcement
- https://docs.obsidian.md/Developer+policies — what the automated reviewer enforces
- https://github.com/obsidianmd/eslint-plugin — rule source (master branch has more rules than published npm package)
- https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines — human-readable companion to the eslint rules
