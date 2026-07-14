# Clean-room agent instructions

Before every task, read these documents in this order:

1. `docs/reference/cleanroom-implementation-policy.md`
2. `docs/tasks/2026/07-13/patch-map-v0-10-rewrite/BRIEF.md`

Repeat this read after context compaction, session resume, or any automatic continuation of a Goal. The clean-room policy cannot be changed or relaxed without explicit user approval.

Do not open or search another worktree, branch, ref, or Git history; original implementation files; a reference package; tarball; bundle; or source map. Use only the approved cumulative v3/v4 handoff, public contracts, normalized expected outputs, and official public dependency APIs. Do not modify `artifacts/expected/**` or approved reference evidence. Every content search must explicitly exclude `node_modules`, `dist`, dependency bundles, and source maps. Dependency verification must use public package imports without opening bundle or source-map contents.

Every subagent and descendant inherits these boundaries. The primary agent alone owns `BRIEF.md` and the canonical logs. Give each subagent a bounded brief stating its goal, allowed boundaries, owned files, validation command, and artifact output path. Do not delegate prohibited-source research.
