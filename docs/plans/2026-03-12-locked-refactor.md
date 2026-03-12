# Locked Interaction Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the locked-interaction changes into smaller, clearer abstractions without changing runtime behavior.

**Architecture:** Keep behavior identical and move repeated logic behind narrow helpers. Each refactor lands in its own commit with targeted tests first, then broader verification, then review.

**Tech Stack:** JavaScript, Vitest, PixiJS, Zod

---

### Task 1: Extract common selection hit-scan flow

**Files:**
- Create: `src/events/find-helpers.test.js`
- Create: `src/events/find-helpers.js`
- Modify: `src/events/find.js`

**Step 1: Write the failing test**

Add tests for a new helper that:
- scans candidate targets from a candidate list
- resolves `hitScope`
- applies `getSelectObject`
- returns the first point hit
- accumulates unique polygon hits
- sorts segment hits by `t`

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/events/find-helpers.test.js`
Expected: FAIL because `src/events/find-helpers.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `src/events/find-helpers.js` with shared scanning helpers and update `src/events/find.js` to delegate to them while preserving the existing candidate ordering logic.

**Step 4: Run focused tests**

Run: `npm run test:unit -- src/events/find-helpers.test.js src/events/find.test.js`
Expected: PASS

**Step 5: Run broader verification**

Run: `npm run test:unit`
Expected: PASS

**Step 6: Review and commit**

Review diff for behavior-preserving extraction only.
Commit: `refactor(selection): extract hit scan helpers`

### Task 2: Extract interaction intent predicates

**Files:**
- Create: `src/utils/interaction-locks.test.js`
- Create: `src/utils/interaction-locks.js`
- Modify: `src/utils/get.js`
- Modify: `src/events/find.js`
- Modify: `src/transformer/resize-context.js`

**Step 1: Write the failing test**

Add tests for a new helper module that exposes:
- `isLocked`
- `hasLockedAncestor`
- `isInteractionLocked`
- `isSelectableCandidate`
- `isResizableCandidate`

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/utils/interaction-locks.test.js`
Expected: FAIL because `src/utils/interaction-locks.js` does not exist yet.

**Step 3: Write minimal implementation**

Move locking predicates into `src/utils/interaction-locks.js`, keep `src/utils/get.js` focused on generic traversal utilities, and update consumers to use the new intent-based helpers.

**Step 4: Run focused tests**

Run: `npm run test:unit -- src/utils/interaction-locks.test.js src/utils/get.test.js src/events/find.test.js src/transformer/resize-context.test.js`
Expected: PASS

**Step 5: Run broader verification**

Run: `npm run test:unit`
Expected: PASS

**Step 6: Review and commit**

Review diff for responsibility cleanup only.
Commit: `refactor(interaction): extract lock predicates`

### Task 3: Centralize unlocked event mode handling

**Files:**
- Create: `src/display/mixins/Lockedable.test.js`
- Modify: `src/display/mixins/Lockedable.js`
- Modify: `src/display/elements/Element.js`
- Modify: `src/display/elements/Rect.js`

**Step 1: Write the failing test**

Add tests for a new default-event-mode contract that:
- uses a class-level default when unlocked
- switches to `none` when locked
- restores the class-level default when unlocked again

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/display/mixins/Lockedable.test.js`
Expected: FAIL because the mixin does not yet honor a configurable unlocked mode.

**Step 3: Write minimal implementation**

Teach `Lockedable` to resolve the unlocked event mode from the instance/class and update `Element` and `Rect` to declare their default mode without duplicating constructor assignments.

**Step 4: Run focused tests**

Run: `npm run test:unit -- src/display/mixins/Lockedable.test.js src/tests/Transformer.test.js`
Expected: PASS

**Step 5: Run broader verification**

Run: `npm run test:unit`
Expected: PASS

**Step 6: Review and commit**

Review diff for event-mode responsibility cleanup only.
Commit: `refactor(display): centralize event modes`
