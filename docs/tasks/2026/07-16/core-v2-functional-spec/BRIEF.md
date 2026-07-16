# Goal

Create and maintain the implementation-neutral user-scenario specification for Core v2. The specification must let a new PixiJS engine replace the current product while accepting the existing dataset schema and preserving geometry, text, color, hierarchy, state, accessibility, and interaction outcomes. It is both the implementation checklist and the source for one executable light-theme Lab case per scenario.

# Scope

- Extract complete functional behavior from approved evidence and real patch-service usage inside this isolated specification workspace.
- Keep implementation-facing artifacts free of Original design while publishing exact dataset-facing and user-observable contracts.
- Cover the full lifecycle from schema and rendering through interaction, history, packaging, actual-host integration, security, performance, canary, rollback, and support.

# Current Facts

Core v2 is the only implementation target and may redesign every API and internal boundary. Compatibility is limited to the existing unversioned array-root dataset schema, genuine PixiJS rendering, and equivalent user-visible meaning; a dataset version is introduced only before a future approved schema change. Platform raster differences are allowed when semantic geometry, content, normalized color, hierarchy, hit targets, accessibility, and interaction results remain equivalent. The specification owner may inspect restricted evidence, but the Core v2 owner receives only this sanitized behavioral contract. Host plant policy, routing, persistence, forms, dialogs, and command eligibility remain outside the engine.

# Current State

The dedicated branch and evidence firewall are active. The sanitized contract contains 135 capability scenarios and 38 P0 consumer journeys for 173 focused Lab cases. All 38 product decisions and their fixture/action/normalized-expected pairs are analysis-owner contract-approved. The previously pending legacy, production, `placement:none`, negative-split, target-Windows budget, and international-text evidence is now sanitized and digest-bound. A generated catalog binds all 173 records to stable routes, priorities, fixture profiles, expected clauses, and SHA-256 provenance; CI rejects catalog, decision, source, priority, or digest drift. Execution remains `not-run`, the Lab remains specified but unimplemented, and Core v2 remains unassessed. Packed-host, accessibility/device, target-Windows, performance, security, and migration results are implementation/release execution prerequisites, not missing contract decisions. No Core v2 implementation code changed in this workspace.

# Next Step

Hand the complete digest-bound contract, 38 decision records, and 173-case catalog to the Core v2 implementation owner; start P0 implementation, actual-observation automation, and one focused Lab route per case without rewriting expected evidence.

# Working Boundary

- `docs/reference/core-v2-functional-spec-policy.md`
- `docs/reference/core-v2-functional-contract/`
- `docs/tasks/2026/07-16/core-v2-functional-spec/`
- `<patch-service>/docs/`
- approved sanitized fixture/evidence exports
