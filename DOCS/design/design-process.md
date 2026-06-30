# SYNC Design Process

Status: Draft v0.1  
Scope: Design workflow, timing, review process, and AI roles  
Related: `docs/design/design.md`

---

## 1. Purpose

This document defines how design work is planned, reviewed, and implemented in SYNC.

`design.md` defines what SYNC should look and feel like.  
`design-process.md` defines when and how design work should happen.

---

## 2. Current Phase Policy

SYNC has completed Phase 1 P0 security hardening apply and regression verification. The current phase is post-P0 stabilization with baseline/schema/RPC realignment pending.

During this phase, design work is limited to:

Allowed:
- Maintaining `docs/design/design.md`
- Maintaining `docs/design/design-process.md`
- Collecting design references
- Reviewing UI risks without code changes
- Auditing current UI against `docs/design/design.md`
- Preparing token and common component plans
- Adding design notes for later

Not allowed unless explicitly approved:
- Large-scale UI redesign
- Global Tailwind token migration
- Shared component refactor
- Admin review UI redesign
- Animation or visual effect work
- Any design change that expands post-P0 stabilization or DB/RPC realignment scope

Reason:
- Baseline/schema/RPC realignment is higher priority than visual refinement.
- UI changes during post-P0 stabilization can make regression tracking harder.
- Reward, admin, and settlement-related UI must not be broadly refactored until the post-P0 baseline is settled.

---

## 3. Design Work Timing

### 3.1 Before P0 Completion

Goal:
- Historical policy: prepare design standards, not redesign screens.

Allowed outputs:
- `design.md` updates
- reference notes
- UI audit notes
- design backlog items

Code impact:
- None, unless explicitly approved.

### 3.2 Post-P0 Stabilization

Goal:
- Convert design rules into low-risk implementation foundations after stabilization planning.

Recommended sequence:
1. Confirm post-P0 verification and baseline realignment status.
2. Audit current UI against `design.md v0.1`.
3. Review collected references.
4. Create `design.md v0.2` if needed.
5. Define Tailwind/CSS token plan.
6. Define common component plan.
7. Prioritize scoped implementation tasks.

Backlog items:
- Delete confirmation UI improvement remains in the design backlog.
- Google Fonts local/self-host transition remains in the stabilization backlog.

### 3.3 During Feature Development After P0

Every new feature should include design review as part of the feature process.

Process:
1. Define user value
2. Define user flow
3. Define required UI states
4. Check `design.md`
5. Implement feature
6. Capture screenshots
7. Review against UI checklist
8. Fix design issues
9. Decide documentation sync level
10. Record design backlog or verification notes when needed
11. Mark feature as complete

A feature is not complete if:
- Loading, empty, or error states are missing
- VIBE, reward, or status information is unclear
- Arbitrary colors or UI patterns are introduced
- The screen violates anti-patterns in `design.md`
- The primary action is ambiguous
- Screenshot review was required but not completed
- Related design docs, backlog notes, or verification records were not considered

---

## 4. Design Review as Definition of Done

Every user-facing feature must pass the following checks.

### 4.1 Product Fit

- Does the UI support archive clarity, reward trust, or fandom immersion?
- Is the main user action obvious?
- Is the screen necessary for the current product phase?

### 4.2 Reward Trust

- Are VIBE, views, syncs, and settlements formatted consistently?
- Are reward formulas or bases visible where needed?
- Are pending, approved, rejected, and settled states clear?

### 4.3 Visual Consistency

- Are existing colors, typography, spacing, radius, and card patterns reused?
- Is `sync-purple` used as the canonical brand accent?
- Are semantic colors used only for semantic states?

### 4.4 AI-ish Pattern Check

- No unnecessary gradient
- No neon glow
- No decorative emoji in trust-critical flows
- No generic 3-column SaaS section
- No arbitrary per-page theme color

### 4.5 Mobile Usability

- Minimum touch target is 44px
- Main content is readable on mobile
- Primary CTA remains clear on small screens

### 4.6 Admin Safety

- Admin screens must be evidence-first
- Approve/reject actions must be explicit
- Final VIBE value must be visible before approval
- UI must not encourage one-click approve bias

### 4.7 Documentation and Backlog Sync

- Decide whether the design task is documentation sync Level 0, 1, 2, or 3 under `AGENTS.md`.
- Record screenshot-review findings when the task changes visible UI.
- Record deferred design or stabilization items in the relevant backlog or design notes instead of leaving them implicit.
- Delete confirmation UI improvement may remain a design backlog item until scoped.
- Google Fonts local/self-host transition may remain a stabilization backlog item until scoped.
- Keep repo design docs and browser AI shared design docs aligned when both exist.

---

## 5. Design Change Levels

### Level 0: Documentation Only

Examples:
- Update `design.md`
- Update `design-process.md`
- Add reference notes

Allowed during post-P0 stabilization:
- Yes

Review required:
- Product review only

### Level 1: Local UI Copy or Minor Style Fix

Examples:
- Fix unclear label
- Improve empty-state copy
- Align spacing in one isolated component

Allowed during post-P0 stabilization:
- Only if it supports P0 work or does not affect verification scope

Review required:
- Product + visual check

Rollback:
- Revert single commit

### Level 2: Component-Level Design Change

Examples:
- Button variant
- StatusBadge
- VibeAmount
- EmptyState
- ErrorAlert

Allowed during post-P0 stabilization:
- No, unless explicitly approved

Review required:
- Product + engineering + regression check

Rollback:
- Revert component commit

### Level 3: Screen-Level Redesign

Examples:
- Archive Feed redesign
- Write page redesign
- Profile redesign
- Settlements redesign
- Admin review redesign

Allowed during post-P0 stabilization:
- No

Review required:
- Product + engineering + screenshot review + regression test

Rollback:
- Feature branch revert

### Level 4: System-Level Design Refactor

Examples:
- Tailwind token migration
- Shared UI kit creation
- Global layout change
- Theme system change

Allowed during post-P0 stabilization:
- No

Review required:
- Full implementation plan, test plan, rollback plan

Rollback:
- Dedicated branch and revert strategy required

---

## 6. AI Role Split

### 6.1 ChatGPT

Use for:
- Product/design decision-making
- Design process definition
- Design review checklist
- `design.md` and `design-process.md` updates
- Breaking design work into implementation tasks

Do not use for:
- Blindly generating final UI without repository context

### 6.2 Perplexity

Use for:
- Latest design references
- UI/UX case studies
- Competitor and pattern research
- Source-based design trend checks

Do not use for:
- Final SYNC-specific product decisions

### 6.3 Gemini

Use for:
- Summarizing long reference reports
- Organizing design research
- Comparing multiple references
- Extracting reusable patterns

Do not use for:
- Final implementation decisions without code context

### 6.4 Codex

Use for:
- Repository-wide implementation
- Tailwind token changes
- Shared component creation
- Multi-file UI refactor
- Tests and code review

Do not use for:
- Open-ended make it prettier tasks

### 6.5 Cursor

Use for:
- Current file edits
- Small UI fixes
- Interactive debugging
- Screenshot-driven refinement

Do not use for:
- System-wide design refactor without a written plan

---

## 7. Design Implementation Workflow After P0

Recommended order:

1. Update `design.md v0.2`
2. Audit current screens against `design.md`
3. Create token implementation plan
4. Create common component plan
5. Apply low-risk token cleanup
6. Create or refactor common components:
   - Button
   - Card
   - Badge
   - StatusBadge
   - VibeAmount
   - EmptyState
   - ErrorAlert
7. Improve core screens in priority order:
   - Archive Feed
   - Write / Activity Creation
   - Reward / Settlements
   - Profile / My Archive
   - Admin Review
8. Run screenshot review
9. Run regression check
10. Merge

---

## 8. Required Design Task Brief

Every design-related implementation task should include:

- Goal
- User value
- Business priority
- Affected screens/files
- `design.md` sections to follow
- Current problem
- Expected behavior
- Out of scope
- Test method
- Rollback plan

Template:

```text
Goal:
User value:
Business priority:
Affected screens/files:
Design.md references:
Current problem:
Expected behavior:
Out of scope:
Test method:
Rollback plan:
```

---

## 9. Screenshot Review Process

After UI implementation:

1. Capture desktop screenshot
2. Capture mobile screenshot
3. Compare against `design.md`
4. Check anti-patterns
5. Check state clarity
6. Check reward/status visibility
7. Record issues
8. Fix only scoped issues
9. Avoid opportunistic redesign

---

## 10. Reference Research Process

Reference research can happen during post-P0 stabilization, but implementation waits until after UI audit, token plan, and common component plan.

Reference notes should be stored in:

`docs/design/references.md`

Each reference should include:
- Service/product name
- Source
- Category
- Good patterns
- Bad patterns
- SYNC-applicable patterns
- SYNC risks
- Applicable screen
- Priority

Reference categories:
- Archive / records
- Fandom / community
- Reward / points
- Fintech / settlement
- Admin review / moderation
- Upload / creation flow

---

## 11. Decision Log

Important design decisions should be recorded here or in a separate changelog.

Format:

```text
Date:
Decision:
Reason:
Alternatives considered:
Impact:
Review needed later:
```

---

## 12. Current Decisions

- `design.md v0.1` is the current design guideline.
- P0 security hardening apply and regression verification passed on 2026-06-29.
- No large-scale UI redesign during post-P0 stabilization and baseline realignment.
- Design reference research may proceed during post-P0 stabilization.
- Actual design implementation starts after UI audit, token plan, and common component plan.
- New features after P0 must include design review in Definition of Done.
- `sync-purple #8B5CF6` is the temporary canonical brand accent.
- Admin UI must be evidence-first, not decorative.
