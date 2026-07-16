# Security, Accessibility, Operations, and Migration

## SEC-001 — Constrain Asset Ingestion

- **Goal:** Load approved map assets without turning dataset input into an execution or
  resource-exhaustion channel.
- **Action:** Load approved/rejected protocols, origins, redirects, data URIs, SVG
  external-resource/script cases, oversized payloads/dimensions, and credential modes.
- **Result:** The host's explicit protocol, origin, redirect, CORS/credential, media,
  encoded-byte, decoded-dimension, and parser allowlists are enforced before fetch,
  decode, cache-lease acquisition, or upload. SVG script and external-resource loading
  are blocked; text is never HTML. Rejected assets yield one target-scoped redacted
  diagnostic while unrelated content and the authoritative state remain usable.
- **Default:** Without an explicit host rule, only package-owned built-in aliases are
  permitted; external/data sources fail closed. Redirects are revalidated at every hop,
  SVG with script/event handler or external-resource constructs is rejected as a whole,
  and no denied request may reach decode/upload or an existing global cache lease.
- **Lab:** `security/asset-policy` uses local deterministic policy fixtures and shows
  only sanitized source hashes.

## SEC-002 — Preserve Safe Scene Extraction

- **Goal:** Produce reports without accepting a tainted, blank, or partial capture.
- **Action:** Extract scenes containing CORS-safe, unreadable, failed, and replaced
  assets before and after view/update changes.
- **Result:** Safe scenes extract the declared rendered revision. Unreadable/tainted
  input fails before report publication with `EXTRACTION_FAILURE`; the live PixiJS
  canvas remains usable and no blank/stale report is accepted.
- **Lab:** `security/extraction-preflight` repeats safe/failing extraction and restoration.

## SEC-003 — Redact Diagnostics and Telemetry

- **Goal:** Diagnose failures without leaking customer or credential-bearing data.
- **Action:** Trigger validation, asset, callback, renderer, and extraction failures
  containing text, data URIs, tokens, query strings, and nested attrs metadata.
- **Result:** Diagnostics keep category, operation, logical ID, revision, counts, and
  sanitized hashes but omit raw text, credentials, secrets, full arbitrary URLs, and
  non-approved attrs. Redaction is identical in logs, events, Lab failure detail, and
  exported evidence.
- **Lab:** `security/redaction` runs a known-secret fixture and fails if the marker is
  found in any captured channel.

## SEC-004 — Verify Package Supply Chain

- **Goal:** Ship only the intended library and auditable dependencies.
- **Action:** Build/pack twice from the release revision and inspect contents,
  dependency/license inventory, vulnerability audit, and evidence firewall.
- **Result:** Declared runtime entries are reproducible or differences are explained;
  the package contains no source maps, restricted evidence, fixtures, secrets, Oracle/
  Original material, dependency bundles, or unapproved licenses/vulnerabilities. An
  SBOM/inventory and digest bind the artifact to release evidence.
- **Lab:** `security/package-provenance` displays the verified package digest and gate
  result; raw package inspection stays automated.

## ACC-001 — Expose a Logical Accessibility Tree

- **Goal:** Navigate and activate the semantic map without depending on renderer
  internals or pointer input.
- **Action:** Inspect and traverse the engine accessibility tree, focus targets, invoke
  actions, and compare the visible interactive PixiJS scene.
- **Result:** Each node exposes stable logical ID, role, name, optional description,
  disabled/selected state, screen bounds, supported actions, and ordered children.
  Visible interactive objects connect through PixiJS AccessibilitySystem; hidden or
  removed nodes do not remain focusable. The engine owns the AccessibilitySystem's
  shadow accessibility overlay/bridge; product tooltip, menu, and editor DOM overlays
  remain host-owned. No duplicate activation is emitted from PixiJS click/tap aliases.
- **Lab:** `accessibility/logical-tree` displays tree order, focus, bounds, and action
  results beside keyboard-operable case controls.

## ACC-002 — Provide Host-Callable Keyboard Parity

- **Goal:** Complete required map actions when direct canvas pointing is unavailable.
- **Action:** Invoke target navigation/selection, focus, pan/zoom, nudge, undo/redo,
  snapshot, and action completion from host-accessible controls.
- **Result:** The same logical IDs, semantic state, history, diagnostics, and view
  result occur as the pointer equivalent where one exists. Pointer-only gestures have
  an explicit host-provided equivalent rather than silently blocking the journey.
- **Lab:** `accessibility/keyboard-parity` compares pointer and host-control observations.

## ACC-003 — Respect Reduced Motion and Visible Focus

- **Goal:** Keep status changes usable for users who request reduced motion.
- **Action:** Enable reduced motion, update animated bars, navigate/focus/select, and
  restore normal motion.
- **Result:** The approved policy publishes exact final values immediately or with the
  reduced duration, creates no stale animation/history, and preserves visible focus/
  selection indicators with approved contrast. Dataset-authored colors remain host
  content and are reported separately.
- **Lab:** `accessibility/reduced-motion` compares final semantic values and motion work.

## OPS-001 — Inspect Bounded Runtime Diagnostics

- **Goal:** Support a production problem without private renderer or customer data.
- **Action:** Read diagnostics during new/ready/load/update/gesture/error/renderer-loss/
  destroy states on two instances.
- **Result:** The snapshot follows `production-readiness.md`: version/digest, instance,
  lifecycle/backend/revisions/counts/active work/last action/error/resource counts are
  bounded, read-only, instance-local, redacted, and cheap when disabled.
- **Lab:** `operations/runtime-diagnostics` shows the compact approved envelope only.

## OPS-002 — Isolate Telemetry and Host Callback Failure

- **Goal:** Observe performance/failure without allowing observers to corrupt the map.
- **Action:** Register, throw from, unsubscribe, re-enter, disable, and dispose telemetry
  and event callbacks during load/update/gesture/extract/destroy.
- **Result:** Delivery follows `engine-boundary.md`; committed state remains valid,
  remaining observers receive deterministic order, one redacted callback diagnostic is
  produced, and no callback survives disposal or prior lifecycle.
- **Lab:** `operations/callback-isolation` prints event order and post-failure probe.

## MIG-001 — Guard Schema-Safe Cutover

- **Goal:** Open and save production data through Core v2 without trapping users in an
  incompatible persisted format.
- **Action:** Load the approved canonical/legacy corpus through the production adapter,
  perform representative edits, export, validate at the persistence boundary, and
  reload.
- **Result:** Normative semantic observations round-trip; generated IDs needed for
  future addressing are explicit; a mismatch/non-serializable value blocks save and
  cutover rather than publishing incompatible data.
- **Lab:** `migration/schema-cutover` shows input/export hashes and semantic diff.

## MIG-002 — Canary Without Duplicate User Effects

- **Goal:** Compare Core v2 safely before making it authoritative.
- **Action:** Run one authoritative engine and optional read-only shadow through load,
  update, selection, command-target, editor mutation, save, and analytics callbacks.
- **Result:** Only the authoritative engine can publish host callbacks, commands,
  persistence, selection, history, or counted analytics. Shadow output is comparison
  evidence only and is disposed without duplicate canvas/listeners or user effects.
  Promotion uses one authoritative engine per session through 1% → 10% → 50% → 100%
  cohorts; any semantic mismatch, runtime error, performance-budget failure, or cleanup
  failure stops promotion.
- **Lab:** `migration/canary-isolation` uses effect counters and a semantic diff.

## MIG-003 — Rehearse Next-Remount Rollback

- **Goal:** Recover from a production regression without converting data or duplicating
  interaction.
- **Action:** Toggle the approved remote/session flag after idle, load failure, update,
  gesture, and remount; return the next authoritative mount to the prior engine.
- **Result:** Rollback uses the same schema-guarded persisted data, creates exactly one
  active canvas/lifecycle, and replays no in-flight gesture/action. It selects the prior
  engine on the next remount and never swaps an active session. The rehearsal evidence
  is bound to the release artifact.
- **Lab:** `migration/rollback` shows active engine, canvas/listener/effect counts, and
  persisted semantic hash.
