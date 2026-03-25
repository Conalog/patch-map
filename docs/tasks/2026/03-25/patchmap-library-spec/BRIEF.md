Goal
- Create a single `spec.md` that is sufficient to reimplement a library with the same externally observable behavior as `patch-map`.
- Base the spec primarily on `docs/reference/patchmap/`, then confirm or refine details against source and tests.

Scope
- Spec Kit deliverables under `specs/001-patchmap-spec/`.
- Language-agnostic public contract: lifecycle, data model, updates, interaction/state, history, transformer, and emitted events.
- Only behavior that is externally observable or required for compatibility.

Current understanding
- The repository already has detailed reference guides for the current JS/TS implementation.
- Those guides are close to a full contract, but they still include implementation framing and are split by topic rather than written as a single normative spec.
- The final spec must avoid language/framework choices while keeping semantic edge cases that affect compatibility.

Current output snapshot
- Spec Kit initialized in-repo with `.specify/` and `.agents/skills/speckit-*`.
- Feature directory created: `specs/001-patchmap-spec/`.
- Completed outputs:
  - `specs/001-patchmap-spec/spec.md`
  - `specs/001-patchmap-spec/checklists/requirements.md`
