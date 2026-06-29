# SYNC Design System v0.1

Status: Draft  
Scope: Design principles and UI guardrails only  
Phase: P0 security recovery period  
Owner: Product / Design / Engineering  
Last updated: YYYY-MM-DD

---

## 0. Purpose

This document defines the initial design rules for SYNC.

SYNC is not a generic social app, a generic SaaS dashboard, or a decorative fandom community. SYNC is a fandom archiving and reward platform where user activities are recorded, verified, synced, and connected to VIBE rewards.

The goal of this document is not to redesign every screen immediately. The goal is to prevent inconsistent AI-generated UI and to provide clear rules for ChatGPT, Codex, Cursor, Gemini, and future contributors.

During the current P0 security recovery phase, this document should be used as a design reference only. Large-scale UI changes should wait until critical reward, admin, and database risks are stabilized.

---

## 1. Product Design Thesis

SYNC UI must balance three qualities:

1. Archive clarity  
   Fan activities should feel recorded, structured, and retrievable.

2. Reward trust  
   VIBE, qualified views, syncs, approvals, and settlements must be visually clear and auditable.

3. Fandom immersion  
   The service should feel emotionally relevant to fans without becoming childish, noisy, or overly decorative.

Core sentence:

> SYNC design is a dark, immersive archive canvas combined with a trustworthy reward dashboard. It should let fan content carry the emotion, while the interface carries structure, verification, and economic clarity.

---

## 2. Brand Keywords

### 2.1 Authentic

Meaning:
- User activities are not merely posted; they are verified and recorded.

Design implications:
- Status badges must be explicit.
- Proof source, verification state, and reward state should not be hidden.
- Avoid vague completed language when the exact state is pending, verified, rejected, or settled.

Risk:
- If overdone, the service may feel bureaucratic or cold.

### 2.2 Immersive

Meaning:
- The UI should act as a dark canvas where fan content can stand out.

Design implications:
- Use dark zinc/black backgrounds.
- Let images, activity content, and archive cards become the visual focus.
- Use decoration sparingly.

Risk:
- Pure black UI can reduce outdoor readability. Maintain enough text contrast.

### 2.3 Systematic

Meaning:
- VIBE rewards, syncs, qualified views, and settlements must feel rule-based and reliable.

Design implications:
- Use tabular numbers for all economic metrics.
- Show reward formulas where relevant.
- Prefer tables, breakdowns, and structured cards for reward/settlement UI.

Risk:
- If too rigid, SYNC may feel like a back-office dashboard rather than a fandom product.

### 2.4 Resonant

Meaning:
- Fan activities should feel connected through Syncs and shared recognition.

Design implications:
- Sync count, activity engagement, and supporter interaction should be visible.
- Micro-interactions may be added later, but they must be subtle.

Risk:
- Glow, pulse, and animation can quickly make the product feel like a game or AI demo.

### 2.5 Lucid

Meaning:
- The user should always understand the current state and next action.

Design implications:
- Every core state must combine color, label, and copy.
- Do not rely on color alone.
- Empty, loading, error, pending, rejected, approved, settled, and locked states must be clear.

Risk:
- Over-explaining every state can create visual clutter. Use short, precise copy.

---

## 3. Core Design Principles

### Principle 1. Record first, decorate later

Fan activity records are the core unit of the product. UI decoration must not compete with activity content, proof source, reward amount, or status.

Do:
- Prioritize activity title, image, source, status, reward, and sync count.
- Use consistent card structure.

Do not:
- Add decorative gradients or visual noise around archive content.

### Principle 2. Reward information must be transparent

VIBE is not a decorative point. It is part of the product economy.

Do:
- Use `tabular-nums` for VIBE, views, syncs, and settlement numbers.
- Show formulas or breakdowns where trust matters.
- Use consistent suffix: `V` or `VIBE`, but do not mix casually.

v0.1 decision:
- Use `V` in compact UI.
- Use `VIBE` in explanatory UI.

Examples:
- Compact: `+120V`
- Detail: `120 VIBE earned`

### Principle 3. State must be explicit

A user should not have to guess whether an activity is pending, approved, rejected, rewardable, or settled.

Every state must include:
- color
- label
- short explanation where needed
- icon only when it improves recognition

Do not rely on color alone.

### Principle 4. Let fandom content carry emotion

SYNC should not hardcode a specific artist color or fandom identity into the global UI.

Do:
- Use neutral dark UI as a flexible frame.
- Let user-generated images, activity text, artist filters, and archive content provide fandom energy.

Do not:
- Use idol-specific colors as core UI colors.
- Use excessive pastel, glitter, emoji, or cute illustrations.

### Principle 5. One screen, one primary action

Each screen should have one dominant action.

Examples:
- Login: receive magic link
- Write: submit record
- Feed: view activity / sync
- Profile: review account and VIBE
- Admin review: approve or reject after evidence review

Do not:
- Create multiple competing floating buttons.
- Duplicate global navigation, page hero CTA, and FAB for the same action.

### Principle 6. Admin UI should be evidence-first

Admin screens are not marketing pages. They exist to support correct review decisions.

Do:
- Show user submission and AI evaluation side by side.
- Keep final decision controls visible and explicit.
- Use dense but readable layouts.

Do not:
- Use large decorative AI score hero sections.
- Add gradients, sparkles, or promotional copy in admin decision screens.

### Principle 7. Design should constrain AI output

AI tools should not invent new visual systems per screen.

Do:
- Use existing tokens.
- Use defined components.
- Use the checklist in this document before merging UI work.

Do not:
- Ask AI to make it beautiful without constraints.
- Allow arbitrary colors, shadows, radii, gradients, and layout patterns.

---

## 4. Current UI Direction

### 4.1 Theme

v0.1 theme:
- Dark only
- Neutral zinc/black base
- Light primary CTA
- Single canonical brand accent

Light mode:
- Deferred

### 4.2 Canonical Brand Color

v0.1 decision:
- Canonical brand color: `sync-purple`
- Current candidate: `#8B5CF6`

Usage:
- Brand accents
- Focus rings
- Select highlights
- VIBE-related emphasis when not semantic

Do not:
- Use fuchsia as a competing brand color in new UI.
- Introduce per-page brand colors.

### 4.3 Semantic Colors

| Meaning | Color family | Usage |
|---|---|---|
| Success / Verified / Approved | Emerald | verified, approved, reward confirmed |
| Warning / Pending | Amber | pending, review required, caution |
| Danger / Error / Rejected | Red | errors, rejection, destructive actions |
| Info / AI analyzed | Blue or Purple | AI analyzed, informational state |
| Neutral / Disabled | Zinc | inactive, archived, locked, secondary text |

Rules:
- Semantic colors must not become page themes.
- Always pair color with text.
- Use tinted backgrounds and subtle borders for alerts.

---

## 5. Color Tokens

These are conceptual tokens. Implementation may be done in Tailwind config, CSS variables, or a shared UI layer after P0 stabilization.

### 5.1 Background

| Token | Meaning | Suggested Tailwind |
|---|---|---|
| `background.canvas` | Main app background | `zinc-950` |
| `background.deep` | Deep immersive background | `black` |

### 5.2 Surface

| Token | Meaning | Suggested Tailwind |
|---|---|---|
| `surface.default` | Default card or panel | `zinc-900/50` |
| `surface.raised` | Higher-emphasis panel | `zinc-900/80` |
| `surface.subtle` | Very subtle layer | `white/5` |

### 5.3 Border

| Token | Meaning | Suggested Tailwind |
|---|---|---|
| `border.subtle` | Default card border | `white/10` |
| `border.strong` | Stronger section border | `white/15` |
| `border.focus` | Focus state | `sync-purple/50` |

### 5.4 Text

| Token | Meaning | Suggested Tailwind |
|---|---|---|
| `text.primary` | Main text | `zinc-50` |
| `text.secondary` | Secondary text | `zinc-300` |
| `text.muted` | Muted/helper text | `zinc-400` |
| `text.disabled` | Disabled text | `zinc-600` |
| `text.inverse` | Text on light button | `zinc-950` |

### 5.5 Brand

| Token | Meaning | Suggested value |
|---|---|---|
| `brand.primary` | Canonical SYNC accent | `sync-purple` / `#8B5CF6` |

### 5.6 Semantic

| Token | Meaning | Color family |
|---|---|---|
| `semantic.success` | verified, approved, completed | `emerald` |
| `semantic.warning` | pending, caution, review required | `amber` |
| `semantic.danger` | error, rejected, destructive | `red` |
| `semantic.info` | AI analyzed, neutral information | `blue` or `purple` |

Rules:
- Avoid raw hex values in components.
- Avoid page-specific background hex values such as `#07080c` or `#0c0e12`.
- Use `bg-zinc-950` or a defined canvas token.
- Do not use arbitrary gradient backgrounds for core screens.
- Do not use fuchsia as a competing brand color in new UI.
- Semantic colors must be used for state, not as page themes.

---

## 6. Typography

### 6.1 Font

Current direction:
- Use Geist Sans as the default interface font.
- Use Geist Mono or tabular number settings for numeric/economic data.
- Korean/English mixed UI must prioritize baseline stability and readability.

Possible future consideration:
- Pretendard may be considered if Korean readability becomes a major issue.

### 6.2 Type Scale

| Role | Suggested Tailwind style | Usage |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` | Functional page headers |
| Marketing title | `text-4xl font-bold tracking-tight` | Landing only |
| Section title | `text-lg font-semibold` | Cards and sections |
| Body | `text-sm leading-relaxed` | Main content |
| Caption | `text-xs` | Metadata and helper text |
| Micro text | Avoid below `text-xs` | Do not use `text-[10px]` or `text-[11px]` in new UI |
| KPI | `text-2xl font-bold tabular-nums` | VIBE, views, syncs, settlement |
| Label | `text-xs font-medium uppercase tracking-wide` | Use sparingly |

Rules:
- Do not overuse uppercase eyebrow labels.
- Do not use excessive letter spacing such as `tracking-[0.25em]` by default.
- Numeric values related to VIBE, views, syncs, and settlements must use `tabular-nums`.

---

## 7. Spacing and Layout

### 7.1 Spacing

Use a consistent 4px/8px rhythm.

Recommended:
- Tight inline gap: `gap-2`
- Card inner spacing: `p-4` or `p-5`
- Section spacing: `space-y-4`, `space-y-6`, `py-8`
- Page padding: `px-4 sm:px-6`

Avoid:
- Arbitrary spacing unless unavoidable.
- Screen-specific spacing scales that cannot be reused.

### 7.2 Layout Widths

| Layout type | Suggested max width | Usage |
|---|---|---|
| Narrow form | `max-w-md` | login, simple forms |
| Content detail | `max-w-2xl` | activity detail, article-like content |
| Feed | `max-w-3xl` | archive feed |
| Dashboard | `max-w-6xl` or `max-w-7xl` | admin, settlements |
| Split review | `max-w-7xl` | admin evidence/decision screens |

Rules:
- Do not create new `max-w-*` values casually.
- Pick one of the layout tiers above.

---

## 8. Radius and Shadow

### 8.1 Radius

| Token | Suggested class | Usage |
|---|---|---|
| sm | `rounded-lg` | small controls, tags |
| md | `rounded-xl` | inputs, buttons |
| lg | `rounded-2xl` | cards, forms |
| xl | `rounded-3xl` | rare hero or high-emphasis panels |

Rules:
- Default card radius is `rounded-2xl`.
- `rounded-3xl` should be rare.
- Do not mix radius values randomly within the same component family.

### 8.2 Shadow

Default:
- Prefer border and surface contrast over heavy shadow.

Allowed:
- subtle card elevation
- focus ring
- minimal hover elevation

Avoid:
- neon glow shadows
- large colored shadows
- podium/ranking glow
- reward glow that makes VIBE look like a game token

---

## 9. Component Standards

### 9.1 Button

Variants:
- Primary
- Secondary
- Ghost
- Danger

Primary:
- Dark UI default: `bg-white text-zinc-950`
- Use for one primary action per screen.

Secondary:
- Border + transparent surface
- Use for lower-priority actions.

Danger:
- Red tint
- Use for reject, delete, destructive actions.

Rules:
- Minimum touch target: 44px.
- Do not use multiple primary buttons in the same section.
- Do not use gradient buttons in core flows.

### 9.2 Card

Variants:
- Default
- Highlight
- Dashed empty

Default:
- `rounded-2xl border border-white/10 bg-zinc-900/50`

Highlight:
- Same structure with subtle brand or semantic border.
- No heavy glow.

Dashed empty:
- For empty archive/feed/shop/inventory states.

Rules:
- Cards must use consistent padding.
- Do not mix blur, glow, gradient, and large shadow in one card.

### 9.3 Badge

Badge types:
- Activity badge
- Source badge
- Status badge
- Reward badge

Rules:
- Status badge must combine color + text.
- Reward badge must use tabular numbers.
- Source badges may include platform icon or short label.

### 9.4 ArchiveCard

ArchiveCard is the standard unit for the feed and user archive.

Must include:
- activity title or summary
- thumbnail or fallback
- author or user context where relevant
- proof/source badge
- activity type
- verification/reward state
- VIBE amount when rewardable
- sync count
- created date or relative time

States:
- default
- hover
- loading/skeleton
- pending
- approved
- rejected
- settled

Rules:
- ArchiveCard should prioritize record information over decoration.
- Images should be visible but must not hide status or reward data.
- Fallback for missing images is required.

### 9.5 VibeAmount

Use for all VIBE displays.

Rules:
- Always use `tabular-nums`.
- Use locale formatting.
- Compact format: `+120V`
- Explanatory format: `120 VIBE`
- Do not animate numbers unless the state change is user-triggered and meaningful.
- Large numbers must not shift layout.

### 9.6 StatusBadge

Required statuses:
- pending
- ai_analyzed
- approved
- verified
- rejected
- settled
- locked
- non_rewardable

Rules:
- Never use color alone.
- Use short status labels.
- Provide explanation in detail screens where needed.

### 9.7 EmptyState

Required structure:
- short title
- one-line explanation
- optional action
- no decorative illustration by default

Rules:
- Use the same empty pattern across feed, shop, inventory, admin queue, and profile sections.
- Avoid generic Nothing here yet without context.

### 9.8 LoadingState

Types:
- text loading
- skeleton loading

Rules:
- Use skeleton for archive cards, dashboard cards, and reward panels.
- Use simple text loading only for short server waits.
- Avoid unstyled Suspense fallback.

### 9.9 ErrorAlert

Required structure:
- clear error title or message
- recovery action where possible
- red semantic tint

Rules:
- Inline error for form-specific issues.
- Toast for transient success/failure feedback.
- Avoid using both for the same event unless necessary.

### 9.10 AdminReviewPanel

Purpose:
- Help admin compare user submission, AI evaluation, and final decision.

Must include:
- user submission evidence
- proof source
- AI evaluation summary
- AI confidence or recommendation if available
- final VIBE input
- approve/reject buttons
- review state

Rules:
- Evidence first, decision second.
- No decorative AI hero.
- No one-click approve without reviewing final value.
- Reject action must allow or require reason when appropriate.

---

## 10. State Design

| State | Meaning | UI rule |
|---|---|---|
| loading | Data is being fetched | Use skeleton for content-heavy areas |
| empty | No data exists yet | Show contextual empty state |
| error | Something failed | Red alert with recovery copy |
| pending | Waiting for review | Amber badge + clear message |
| ai_analyzed | AI has reviewed but not final | Info badge, not success |
| approved | Admin approved | Emerald badge |
| verified | Verified activity/account | Emerald badge |
| rejected | Not accepted | Red badge + reason where possible |
| settled | Reward finalized | Brand or emerald badge depending context |
| locked | User cannot act | Disabled control + reason |
| non_rewardable | Activity has no reward | Neutral badge + explanation |
| admin_only | Restricted to admin | 403/unauthorized copy, not silent redirect when possible |

Rules:
- State labels must be consistent across user and admin screens.
- Admin-only states may be denser but must not be ambiguous.
- Rejected and non-rewardable states must be user-facing when relevant.

---

## 11. Screen-Level Direction

### 11.1 Home / Archive Feed

Direction:
- Feed-first compact archive page.

Avoid:
- Large marketing hero in logged-in product home.
- Duplicate Header + page hero branding.
- Multiple write CTAs.

Priority:
1. archive feed
2. artist/filter chips
3. activity write entry
4. reward/sync visibility

### 11.2 Login

Direction:
- Minimal dark form.

Keep:
- centered layout
- clear email input
- white primary CTA
- concise feedback messages

Avoid:
- decorative fandom visuals
- unnecessary onboarding copy

### 11.3 Write / Activity Creation

Direction:
- Structured form card.

Must show:
- required input fields
- proof/source requirement
- submission state
- reward rule if relevant

Avoid:
- all options expanded at once
- decorative emoji in reward rules
- unclear pending copy

### 11.4 Activity Detail

Direction:
- Trust-first activity record.

Must show:
- content
- author/source
- verification state
- views/syncs
- reward formula
- comments or interactions

Avoid:
- hiding non-approved/rejected states
- making reward look like decoration

### 11.5 Profile / My Archive

Direction:
- Account + economy summary + personal archive.

Must show:
- user identity
- verification state
- VIBE balance
- settlement access
- owned activity records

Avoid:
- mixing public and private information unclearly
- unconnected decorative components

### 11.6 Settlements / Reward

Direction:
- Structured economic dashboard.

Must show:
- total VIBE
- weekly or period summary
- breakdown
- settlement state
- formula explanation where needed

Avoid:
- gradient hero
- cramped number tables
- inconsistent V/VIBE formatting

### 11.7 Admin Dashboard

Direction:
- Dense, utilitarian, evidence-first.

Must show:
- pending queue
- risk/status
- action priority
- review entry point

Avoid:
- marketing hero
- decorative ranking/podium visuals
- one-click approve patterns

### 11.8 Admin Review

Direction:
- Split view: evidence left, decision right.

Must show:
- user submission
- proof/source
- AI evaluation
- final VIBE field
- approve/reject controls

Avoid:
- oversized AI score hero
- sparkles/AI product decoration
- hiding final decision controls below long scroll

---

## 12. Anti-Patterns

The following patterns are disallowed unless explicitly approved.

1. Purple/pink/blue gradient hero used as default page style
2. Glowing blob background
3. Neon glow around buttons or cards
4. Overuse of glassmorphism or backdrop blur
5. Three-column generic SaaS feature cards
6. Multiple competing accent colors per page
7. Decorative emoji in reward, settlement, or admin decision UI
8. Large AI score hero in admin screens
9. Centered marketing hero on every functional screen
10. Random `text-[10px]` or `text-[11px]` usage
11. Arbitrary page-specific hex backgrounds
12. Multiple primary CTAs on one screen
13. Artist-specific color hardcoding in global UI
14. Game-like ranking/podium visuals that reduce trust
15. New UI components with no token or reuse plan

---

## 13. AI / Codex / Cursor Implementation Rules

When generating or editing UI:

1. Do not create new colors unless they map to defined tokens.
2. Do not use arbitrary gradients.
3. Do not add glow unless explicitly requested.
4. Use `sync-purple` as canonical brand accent.
5. Use semantic colors for state only.
6. Use `tabular-nums` for all VIBE, view, sync, and settlement numbers.
7. Use one primary CTA per screen.
8. Use existing layout tiers.
9. Use existing component patterns before creating new ones.
10. Keep admin screens evidence-first and decoration-light.
11. Show formulas or breakdowns for reward trust.
12. Include loading, empty, error, and permission states when adding a feature.

---

## 14. Definition of Done for UI Work

A feature is not complete until the following checks pass.

### Product Value

- Does the screen make the user value clear?
- Does the user know what action to take?
- Does the UI support fandom activity, archive clarity, or reward trust?

### Reward Trust

- Are VIBE, views, syncs, and settlement values formatted consistently?
- Is the reward state clear?
- Is the formula or basis visible where needed?

### State Clarity

- Are loading, empty, error, pending, approved, rejected, and locked states handled?
- Are state colors paired with text labels?

### Visual Consistency

- Are tokens used?
- Is the brand color consistent?
- Are radius, spacing, and typography aligned with this document?

### AI-ish Pattern Check

- No unnecessary gradient?
- No neon glow?
- No generic 3-column SaaS layout?
- No decorative emoji in trust-critical flows?
- No arbitrary color/theme per page?

### Mobile Usability

- Are touch targets at least 44px?
- Is text readable on mobile?
- Does the primary action remain clear on small screens?

### Admin Safety

- Is the admin decision flow evidence-first?
- Is final VIBE input visible?
- Is approve/reject behavior explicit?
- Does the UI avoid one-click approve bias?

---

## 15. P0 Phase Policy

During P0 security recovery:

Allowed:
- Update this document.
- Add review notes.
- Define tokens conceptually.
- Identify UI risks.

Not allowed unless explicitly approved:
- Large-scale UI refactor.
- Global Tailwind token migration.
- Replacing shared components.
- Redesigning admin decision flow while security validation is ongoing.
- Adding new animations or visual effects.

After P0:
1. Convert this document into Tailwind/CSS tokens.
2. Create common UI components.
3. Refactor duplicated button/card/badge/input patterns.
4. Improve core screens in this order:
   - Archive Feed
   - Write / Activity Creation
   - Reward / Settlements
   - Profile / My Archive
   - Admin Review
5. Run reference review and update to design.md v0.2.

---

## 16. Open Questions for v0.2

1. Should SYNC remain dark-only, or support light mode?
2. Should `sync-purple #8B5CF6` remain final brand color after reference review?
3. Should Passport become a real product component or be deprecated?
4. How should rejected/non-rewardable activity be shown to users?
5. How much AI evaluation detail should be exposed to normal users?
6. Should leaderboard be a serious contribution dashboard or a gamified ranking screen?
7. Should admin UI have a separate dense theme or remain visually close to user-facing UI?

---

## 17. Summary

Keep:
- Dark canvas
- Minimal forms
- Archive-first FeedCard structure
- VIBE tabular number formatting
- Reward formula transparency
- Semantic status colors
- Evidence-first admin review

Reduce:
- Gradients
- Glow
- Glassmorphism
- Decorative emoji
- Page-specific accent themes
- Generic SaaS hero sections

Decide later:
- Light mode
- Passport
- Leaderboard visual tone
- Full reference-based brand refinement
