# Decisions

**2026-07-13**

- **Background:** PATCH MAP v0.10 will be rewritten over a long-lived clean-room effort that must remain safe across handoffs, compaction, and delegated work.
- **Decision:** `docs/reference/cleanroom-implementation-policy.md` is the canonical source for clean-room rules and may not be relaxed without explicit user approval.
- **Why:** A durable, single policy prevents accidental access to prohibited materials or drift in compatibility, performance, and evidence standards.
- **Impact:** Every resumed session and delegated task must read and follow the policy before acting; conflicting local assumptions are invalid.
