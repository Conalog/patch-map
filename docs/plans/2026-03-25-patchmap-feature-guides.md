# Patchmap Feature Guides Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce repository-local feature guides for the current `patch-map` implementation, with project-context artifacts and explicit coverage verification.

**Architecture:** Keep durable task context in `docs/tasks/...`, write canonical guides in `docs/reference/patchmap/`, and split drafting by independent feature domains. Review each drafted guide against current source behavior before finalizing the coverage matrix.

**Tech Stack:** Markdown, repository source (`README.md`, `src/**/*.js`, `src/**/*.ts`), project-context task files, subagents for drafting/review.

---

### Task 1: Bootstrap Project Context

**Files:**
- Create: `docs/memory.md`
- Create: `docs/tasks/2026/03-25/patchmap-feature-guides/BRIEF.md`
- Create: `docs/tasks/2026/03-25/patchmap-feature-guides/STATUS.md`
- Create: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/DECISIONS.md`
- Create: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/WORKLOG.md`

**Step 1:** Create the task workspace and global memory.

**Step 2:** Record the documentation scope, assumptions, and validation strategy.

### Task 2: Inventory Public Features

**Files:**
- Modify: `docs/tasks/2026/03-25/patchmap-feature-guides/BRIEF.md`
- Modify: `docs/tasks/2026/03-25/patchmap-feature-guides/STATUS.md`
- Append: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/WORKLOG.md`

**Step 1:** Read exported APIs and README feature sections.

**Step 2:** Group features into independent documentation domains.

### Task 3: Draft Domain Guides in Parallel

**Files:**
- Create: `docs/reference/patchmap/*.md`
- Append: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/WORKLOG.md`

**Step 1:** Dispatch subagents with disjoint write scopes.

**Step 2:** Draft guides for each feature domain with source-backed usage notes.

### Task 4: Review and Correct Guides

**Files:**
- Modify: `docs/reference/patchmap/*.md`
- Append: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/DECISIONS.md`
- Append: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/WORKLOG.md`

**Step 1:** Review each guide for feature coverage and source accuracy.

**Step 2:** Fix gaps, inconsistencies, or unclear examples.

### Task 5: Verify Coverage

**Files:**
- Create: `docs/reference/patchmap/coverage-checklist.md`
- Modify: `docs/tasks/2026/03-25/patchmap-feature-guides/STATUS.md`
- Append: `docs/tasks/2026/03-25/patchmap-feature-guides/logs/WORKLOG.md`

**Step 1:** Cross-check guides against public exports and README/API sections.

**Step 2:** Run project-context guardrails and repository tests relevant to documentation confidence.
