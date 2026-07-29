# Decisions

**2026-07-29**

- **Background:** Core v2 must be compared with `main`, while the existing clean-room policy forbids unrestricted reference implementation access.
- **Decision:** Treat `main` as a disposable, read-only black-box runtime oracle and prohibit implementation-source inspection or copying.
- **Why:** Runtime observations reveal visible and functional parity gaps without coupling the PixiJS implementation to reference internals.
- **Impact:** Operational manifests, public fixtures, browser state, and captures may be used; all repairs remain independently designed in Core v2.
