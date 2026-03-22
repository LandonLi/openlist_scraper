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

### 3.1 Standard delivery checklist

- For any confirmed fix or tightly scoped feature, default to this GitHub workflow unless the user explicitly asks for a partial stop.
- Recommended sequence:
  1. confirm whether an existing GitHub issue already tracks the work
  2. if not, create a focused issue with labels, milestone, and a clear problem statement
  3. add the issue to the roadmap project when it belongs on the roadmap, and set `Track` and `Status` intentionally
  4. create a dedicated `codex/` branch for that issue or fix
  5. implement the change and verify it locally
  6. commit with signing enabled
  7. push the branch
  8. open a PR that links the issue and includes testing notes
  9. review PR readiness before merging:
     - confirm the diff is focused
     - confirm the merge state is clean
     - confirm required checks are complete or intentionally absent
  10. merge the PR and delete the remote branch
  11. confirm the linked issue closed, or close it manually if auto-close did not happen
  12. update the roadmap project item to `Done` when the work is shipped or no longer active
  13. close the milestone when its scoped work is complete and released
  14. prune local and remote-tracking branches so only active branches remain visible
- Do not leave the workflow half-finished when the remaining steps are straightforward bookkeeping.
- If you intentionally stop before merge or release, say exactly which of the above steps are still pending.

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
  3. build and smoke-test the release locally when practical, especially for hotfixes or installer-sensitive changes
  4. create and push the signed git tag, for example `v1.2.2`
  5. create the GitHub release with release notes that summarize shipped fixes and known follow-ups
  6. let the GitHub Actions release workflow build and upload the Windows release assets
  7. verify the GitHub release contains the expected assets and that the workflow succeeded
- Current Windows packaging flow:
  - run `pnpm build`
  - output goes to `release/<version>/`
  - build output includes:
    - `OpenListScraper-Windows-<version>-Setup.exe`
    - `OpenListScraper-Windows-<version>-Setup.exe.blockmap`
    - `latest.yml`
- Default publishing rule:
  - prefer GitHub Actions as the canonical path for release asset publishing
  - do not manually upload release assets if the release workflow is expected to handle them
  - use local manual upload only as an explicit fallback when:
    - the workflow is unavailable or failing
    - the user explicitly asks for a manual release
    - a hotfix must ship before CI can be repaired
  - if manual upload is used, say so clearly in the final handoff and avoid assuming the workflow artifacts are the source of truth
- Notes:
  - `.blockmap` and `latest.yml` are required for the current Windows auto-update flow
  - the app now has a GitHub Actions release workflow; local packaging is still useful for smoke testing and CI fallback
  - unsigned installers may trigger standard Windows warnings

### 7.1 Sandbox and escalation notes

- For this repository, assume GitHub CLI commands usually need escalation in Codex desktop because `gh` reads auth/config from the user profile, which the sandbox may not be allowed to access.
- In practice, the following GitHub bookkeeping steps should be treated as escalation-first:
  - viewing or editing issues, milestones, releases, or project items with `gh`
  - creating releases, uploading release assets, or editing roadmap project fields
- Treat `npm run build` as escalation-first for release work in Codex desktop.
  - Verified failure mode in sandbox: Vite/esbuild can fail with `spawn EPERM` while loading `vite.config.ts`
  - Release packaging should therefore request escalation before attempting the final production build
  - Even when GitHub Actions is the default publishing path, a local escalated build is still useful for pre-release smoke testing or manual fallback publishing
- Prefer repository-local scripts such as `npm run build`, `npm run lint`, and `npm run dev` over globally installed tools.
  - `pnpm` and `corepack` may be unavailable in the sandbox shell even when the repo uses `pnpm`
  - Avoid depending on ad hoc global binaries during release prep unless escalation is already approved
- If a release wrap-up depends on both a signed git push and GitHub release operations, call out the expected escalation points up front before starting the final publishing sequence.
- When a GitHub release is expected to trigger the release workflow, avoid racing it with a redundant manual asset upload unless you are intentionally using the fallback path.
- Treat signed git operations as a separate preflight check during release wrap-up.
  - Before committing, tagging, or pushing, verify that git signing works in the current environment
  - If commit signing or tag signing fails, stop and ask the user how they want to proceed
  - Never fall back to unsigned commits or unsigned release tags just to get the release out

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
- For hotfixes and patch releases:
  - add the issue to the project if it is user-visible, release-relevant, or needed for roadmap continuity
  - set `Track` to `Release` unless the work is clearly product UX or engineering debt instead
  - set `Status` to `In Progress` while the fix is actively being implemented
  - set `Status` to `Done` after the PR is merged and the release or wrap-up is complete

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
- OpenList API documentation source of truth:
  - index: `https://fox.oplist.org/llms.txt`
  - when confirming OpenList API request/response fields (for example `/api/fs/list`), always resolve and read the linked OpenList docs from this index first.
  - do not guess field names or semantics when implementing OpenList integration; if docs are unclear, pause and confirm with the user.
- After manual user testing succeeds, follow through and complete the GitHub bookkeeping instead of stopping at code changes.
- If a release has already shipped, record follow-up work as new issues instead of mutating the meaning of the shipped issue.
- When cleaning branches after merge or release:
  - delete merged local `codex/` branches
  - delete merged remote branches or confirm they were deleted by PR merge
  - run a prune step so stale `origin/codex/*` refs do not linger locally
- Keep repository state understandable for the next session:
  - focused PRs
  - explicit milestones
  - updated roadmap project
  - release notes that explain what actually shipped
