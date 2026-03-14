# AGENTS.md

## Purpose

This repository uses a lightweight GitHub-first workflow for bug fixes, release prep, and roadmap planning. Follow the steps below so issues, pull requests, releases, milestones, and projects stay in sync.

## GitHub Workflow

### 1. Review and issue intake

- Start from a code review mindset: identify concrete bugs, regressions, risks, and missing tests first.
- Separate findings into:
  - confirmed implementation bugs
  - product or feature gaps that need confirmation
  - engineering debt
- Create or update GitHub issues for confirmed work items.
- Use clear issue titles with a type prefix such as `Bug:`, `Feature/UI gap:`, or `Tech debt:`.

### 2. Labels

- Reuse existing labels whenever possible.
- Current labels in use:
  - `bug`
  - `enhancement`
  - `question`
  - `priority:high`
  - `priority:medium`
  - `area:scanner`
  - `area:local`
  - `area:metadata`
  - `area:network`
  - `area:data`
  - `area:release`
  - `area:ci`
  - `area:update`
- If a missing label is needed, create it before applying it to issues.

### 3. Branching and pull requests

- Always create working branches with the `codex/` prefix.
- Prefer one issue or one tightly related fix per branch.
- Keep PRs focused. Do not mix unrelated bug fixes and release metadata changes in the same PR unless there is a strong reason.
- All commits must be signed.
- Never use `--no-gpg-sign` or any other bypass for commit signing.
- If commit signing fails, stop and ask the user how they want to proceed instead of creating an unsigned commit.
- Use PR descriptions that include:
  - a short summary
  - testing performed
  - issue linkage such as `Fixes #123` when appropriate
- After user validation, push the branch, open the PR, and merge it when approved.

### 4. Issue lifecycle

- When fixing an existing issue:
  - implement the code change
  - verify the behavior locally or with user-assisted testing
  - open a PR that references the issue
  - merge the PR
  - confirm the issue is closed automatically or close it manually if needed
- If a fix reveals a new adjacent gap, create a new issue instead of silently broadening the original one.

### 5. Milestones and version planning

- Use milestones for version-level planning.
- Recommended usage:
  - patch releases for bugfix rollups, such as `v1.2.2`
  - minor releases for user-facing feature work, such as `v1.3.0`
  - later milestones for release polish or engineering debt, such as `v1.3.1` and `v1.4.0`
- Create milestones before or during active work, then assign open issues to them.
- Do not rely on milestones alone as the historical record for completed releases. Git tags, releases, PRs, and merged commits are the canonical delivery trail.

### 6. Version bumps

- When a set of merged fixes is ready to ship, bump the version in `package.json`.
- Keep the version bump in its own small PR when possible.
- Merge the version bump before creating the GitHub release.

### 7. Releases

- Release flow for a shipped version:
  1. ensure the relevant fixes are merged
  2. merge the version bump PR
  3. create the GitHub release and tag, for example `v1.2.2`
  4. add release notes that summarize shipped fixes and known follow-ups
  5. build release assets
  6. upload release assets to the GitHub release
- Current Windows packaging flow:
  - run `pnpm build`
  - output goes to `release/<version>/`
  - upload:
    - `OpenListScraper-Windows-<version>-Setup.exe`
    - `OpenListScraper-Windows-<version>-Setup.exe.blockmap`
    - `latest.yml`
- Notes:
  - `.blockmap` and `latest.yml` are relevant for future auto-update support
  - the app currently uses the default Electron icon unless issue `#13` is addressed
  - unsigned installers may trigger standard Windows warnings

### 8. Roadmap planning

- Use GitHub Projects for longer-term planning and status tracking.
- Current project:
  - `OpenListScraper Roadmap`
  - URL: `https://github.com/users/LandonLi/projects/1`
- Keep roadmap work in the project even when milestones already exist.
- Current custom field:
  - `Track` with values:
    - `Product`
    - `Release`
    - `Engineering`
- Current useful views:
  - `Table`
  - `Board`
  - `Roadmap`

### 9. Status rules for the roadmap project

- Only mark one primary next item as `In Progress` unless multiple workstreams are truly active.
- Default interpretation:
  - `Todo`: planned, not started
  - `In Progress`: actively being worked on now
  - `Done`: completed and no longer the active roadmap concern
- Prefer this sequence:
  - finish the active product-facing item
  - then move to the next release or engineering item

### 10. Current planning baseline

- `v1.3.0`
  - `#10` scraped media history UI
  - `#15` in-app auto-update support
- `v1.3.1`
  - `#13` release packaging polish, icons, installer QA
- `v1.4.0`
  - `#11` ESLint and TypeScript hygiene baseline
  - `#14` GitHub Actions automated release builds
- Current active roadmap item:
  - `#10` is the default `In Progress` item unless reprioritized

## Practical Rules

- Prefer verified fixes over speculative fixes.
- After manual user testing succeeds, follow through and complete the GitHub bookkeeping instead of stopping at code changes.
- If a release has already shipped, record follow-up work as new issues instead of mutating the meaning of the shipped issue.
- Keep repository state understandable for the next session:
  - focused PRs
  - explicit milestones
  - updated roadmap project
  - release notes that explain what actually shipped
