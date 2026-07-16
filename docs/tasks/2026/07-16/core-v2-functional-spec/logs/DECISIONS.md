# Decisions

**2026-07-16**

- **Background:** Core v2 proved a PixiJS-based performance direction but implements only a narrow feature subset.
- **Decision:** Define replacement scope through complete user-observable scenarios while requiring only the existing dataset schema and PixiJS, not Original API compatibility.
- **Why:** This preserves product behavior without constraining Core v2 to Original public or internal architecture.
- **Impact:** Core v2 may redesign every API, but it cannot claim completion until the scenario and Lab checklist passes.

**2026-07-16**

- **Background:** Exhaustive capability extraction benefits from Original source access, while Core v2 must not inherit Original design.
- **Decision:** Use an isolated spec owner with a two-layer evidence firewall: restricted source audit notes and sanitized behavior-only handoff artifacts.
- **Why:** The split reduces feature omission without exposing Core v2 implementation work to Original architecture or algorithms.
- **Impact:** Only sanitized scenario contracts may cross into the Core v2 implementation workspace.

**2026-07-16**

- **Background:** Real consumers combine engine behavior with plant-domain data merging, commands, editor forms, persistence, and navigation.
- **Decision:** Keep domain policy in the host and require Core v2 to provide only the deterministic rendering, update, interaction, history, extraction, and lifecycle capabilities needed to execute those journeys.
- **Why:** This preserves every user outcome without hardcoding patch-service business policy or rebuilding the Original API.
- **Impact:** The 38 consumer journeys are P0 acceptance cases, while their wiring, storage, command, and save orchestration are mocked by the Lab or supplied by the host.

**2026-07-16**

- **Background:** Feature lists alone cannot prove interaction correctness or expose main-thread freezes.
- **Decision:** Treat the light-theme Core v2 Lab as an executable scenario catalog with one route and focused control or real gesture per contract ID.
- **Why:** Repeated direct actions, seeded random bars/text, semantic assertions, and frame-gap telemetry make missing behavior and performance regressions observable.
- **Impact:** A feature cannot be marked complete without both automated evidence and its individual Lab case; the comparison Lab remains separate.

**2026-07-16**
- The existing dataset accepts PixiJS-compatible stroke and text style extensions, so an unspecified passthrough would make acceptance depend silently on dependency version.
- Freeze the Core v2 dataset contract to the enumerated PixiJS v8 public stroke and text style keys, exact default stroke values, and exact theme-path-to-RGBA mappings.
- Executable fixtures and strict validation require deterministic accepted keys, types, defaults, and normalized color intent.
- Core v2 may optimize rendering freely but must validate this frozen style language; future PixiJS style additions require an explicit contract revision.

**2026-07-16**

- **Background:** Three independent blind audits found that broad scenario coverage still required implementers to invent dataset, state, evidence, and production-release behavior.
- **Decision:** Treat the contract as implementation-start-ready only after closed schema/observation/state boundaries, and require evidence-level promotion through actual-host, security, performance, canary, and rollback gates before a production replacement claim.
- **Why:** Feature count and Lab demos cannot prove deterministic implementation, packaged integration, operational safety, or reversible migration.
- **Impact:** The handoff now has 173 focused cases plus versioned schema/observation, engine-boundary, and production-readiness contracts; unresolved P0 decisions or missing canonical evidence block only their dependent work but block final release.

**2026-07-16**

- **Background:** Final engineering review found that lifecycle retry, semantic-versus-visible events, frame identity, mutation paths, diagnostics, extraction, and stale handles still allowed incompatible implementations.
- **Decision:** Freeze a versioned mutation language, closed diagnostic registry, exact revision/publication traces, target-checkpoint extraction, stale-handle rejection, and single-source open-question coverage.
- **Why:** A production rewrite needs mechanically testable state and failure semantics, not only a complete capability list or plausible Lab behavior.
- **Impact:** Independent product, engineering, and release re-audits now pass for closed rows; 23 unresolved P0 decisions and missing canonical evidence remain explicit non-bypassable production gates.

**2026-07-16**

- **Background:** The implementation checklist still contained product-choice gaps across dataset compatibility, editing, interaction, assets, accessibility, runtime, performance, security, and migration.
- **Decision:** Adopt the owner's 30 answers as the normative resolution of all 38 decision-registry rows while keeping canonical expected evidence and review state separate from decision status.
- **Why:** Core v2 needs one implementable behavioral contract without inheriting Original APIs or asking implementers to invent product outcomes.
- **Impact:** Product decisions are closed and dependent prose is updated; implementation promotion still requires immutable fixture/expected evidence, Lab and automation, packed-host integration, target-Windows results, and release gates.

**2026-07-16**

- **Background:** Resolved product choices still needed immutable, machine-auditable fixture/action/expected records without confusing contract review with implementation or release approval.
- **Decision:** Bind every decision to a canonical JSON pair and keep `decisionStatus`, `contractReview`, `execution`, `executionReview`, and computed readiness as separate states; approve only non-circular exact expectations.
- **Why:** Implementations must consume fixed semantic evidence, while legacy, production, platform, device, and Unicode outputs that require external proof must remain explicit instead of being guessed.
- **Impact:** Thirty-two decision records are analysis-owner contract-approved, six are pending external contract evidence, exact runtime/device runs remain execution prerequisites, all execution is not-run, and no row advances beyond `spec-ready` from this review alone.

**2026-07-16**

- **Background:** Core v2 implementation still required six exact decision-evidence inputs and a complete machine-auditable catalog for 135 capability scenarios plus 38 consumer journeys.
- **Decision:** Approve the sanitized legacy, production, placement, split, Windows-budget, and international-text contracts; bind all 173 cases to generated fixture/action/normalized-expected records and enforce drift in CI.
- **Why:** Implementation can now begin from fixed observable semantics without guessing, importing Original design, or self-authoring expected results.
- **Impact:** Pre-implementation contract evidence is 38/38 decisions and 173/173 catalog records approved; runtime, Lab, packed-host, device, performance, accessibility, security, and migration execution remain separate gates.
