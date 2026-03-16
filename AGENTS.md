# AGENTS.md

This document defines the operating rules for agents working in `/Users/crmin/workspace/conalog/patch-map`.

## Language Rules

- Prefer the user's preferred language for responses when a preference is clear.
- Write working documents in English.
- Respect the existing language and style of code, comments, and surrounding files unless the task requires a change.

## General Rules

- Complete requested changes as a single flow that includes implementation, required documentation updates, and verification.
- Keep outputs scoped to the user's request. Do not create extra artifacts unless they are required.

## SPEC.md Update Rules

- Treat `SPEC.md` as a living specification for the repository.
- Whenever code changes, check whether the change affects external behavior, public APIs, options, events, data schemas, rendering results, constraints, build outputs, or dependency assumptions.
- If any of those areas change, update `SPEC.md` in the same piece of work.
- Do not defer `SPEC.md` updates to a follow-up task. Include them in the same commit as the related code change.
- Update `SPEC.md` even for refactors when observable behavior or implementation guarantees change.
- If public usage, installation, or examples also change, update `README.md` and `README_KR.md` as needed.
- Before finishing, confirm that the code diff and `SPEC.md` are still aligned.

## Change Checklist

1. Review the relevant code and the matching section in `SPEC.md`.
2. Make the code change.
3. Update `SPEC.md` in the same change set when the specification is affected.
4. Update `README.md` and `README_KR.md` when user-facing guidance changes.
5. State whether `SPEC.md` was updated in the final summary.

## Commit Message Rules

- Follow the existing `git log` pattern for commit messages.
- Use the format `type: short english summary`.
- Use lowercase Conventional Commit style types.
- Common types in this repository include `feat`, `fix`, `chore`, and `refactor`.
- Keep the summary short and written in English.
- Based on the current history, omit scope by default.

Examples:

- `feat: add viewport padding overrides`
- `fix: support immediate focus and fit after draw`
- `chore: update dependencies`
