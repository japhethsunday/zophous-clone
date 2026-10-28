# Cloudnivo design system (v3)

How the app should look and behave. The CSS lives in `src/style.css`. The newest layer, "design system v3", is at the end of that file.

## What we learned from the competition (October 2026)

| | Everygen (everygen.ai/home) | Ssemble (app.ssemble.com) | Cloudnivo |
|---|---|---|---|
| Layout | Left sidebar, prompt-first hero, tool grid | Top nav, narrow centred upload box, project grid | Left sidebar, full-width top bar, command bar, tool grid |
| First action | "What should Wizard make?" prompt | YouTube URL field plus a separate upload box | One command bar: a link starts clipping, text starts generating |
| Type | Custom display face plus SF Pro, 28px section titles | System font, mixed weights | Inter, with JetBrains Mono for numbers and labels |
| Colour | White, near-black text, coloured square tool icons | Blue buttons, purple gradient Upgrade, emoji in nav | Violet accent, neutral greys, six tool tones |
| Weak spots | Empty space while the tool list loads; many nested menus | Crowded nav, emoji, promo carousel in the main flow, no sidebar | Keep it calm: no promos, no emoji, no upsell |

How we beat them:
- **One input.** A single command bar replaces Ssemble's separate URL and upload boxes and Everygen's agent prompt. It detects a link or plain text.
- **Everything one click away.** Tools are flat tiles grouped by All, Clip, Create and Publish. There are no nested sub-menus.
- **Clear status.** Usage (minutes and credits) sits in the top bar and the sidebar. Setup progress is a small checklist, not a banner.
- **No noise.** No pricing, upgrade prompts, carousels or emoji in the app.

## Tokens

| Group | Tokens |
|---|---|
| Accent | `--accent #5b3df5`, `--accent-hover`, `--accent-deep`, `--accent-soft`, `--accent-line` |
| Neutrals | `--ink`, `--muted`, `--faint`, `--line`, `--line-strong`, `--panel`, `--panel-warm`, `--raise` |
| Tool tones | `--tone-violet`, `--tone-blue`, `--tone-pink`, `--tone-amber`, `--tone-teal`, `--tone-green` |
| Type | `--font-sans` (Inter), `--font-mono` (JetBrains Mono) |
| Radius | 6px for chips and small buttons, 8–9px for buttons and inputs, 12px for tiles and cards, 16px for the hero |
| Motion | `--ease: cubic-bezier(.2,.8,.2,1)`, 150ms for hover and focus |

Rules:
- Use mono only for numbers, counters and small uppercase labels.
- Use tool tones only for tool icons. Use the accent for the main action and focus.
- Show one primary (violet) button per view.

## Components

- **Command bar** (`.cmd-bar`): an input plus a submit button. It shows "Clip link" or "Generate" while you type. Enter submits. The submit button is disabled while the field is empty.
- **Tool tile** (`.tool-tile` + `.tool-ic.tone-*`): a 36px coloured icon, a title and a one-line description. It lifts 1px on hover.
- **Segmented control** (`.seg`): filter tabs. The selected tab gets a white raised pill and `aria-selected`.
- **Empty state** (`.empty-state`): dashed border, an icon, a title, one sentence and one action.
- **Setup card** (`.setup`): a progress bar plus a checklist. Done items are struck through. Locked items show a lock and are disabled.
- **Buttons**: `.btn-purple` (primary), `.btn-outline` (secondary), `.btn.sm` (in toolbars).

## Accessibility

- Every icon-only button has an `aria-label`.
- The focus ring is the accent colour, with a 3–4px soft halo on inputs.
- Text contrast is at least 4.5:1. `--faint` on white is 5.4:1.
