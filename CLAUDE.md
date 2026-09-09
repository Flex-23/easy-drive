@AGENTS.md

## Skills installed for this project

`.claude/skills/` is **git-ignored** — the skills are third-party content with
mixed licensing, and the settings beside them are machine-specific. Install them
by copying these five folders from `Desktop/skills/.claude/skills/`; this file is
the record of which ones the project relies on and why:

| Skill | Reach for it when |
| --- | --- |
| `karpathy-guidelines` | any code change — surgical edits, no speculative abstraction, state assumptions, define how the change will be verified |
| `web-design-guidelines` | auditing a screen for accessibility and interface-guideline compliance |
| `emil-design-eng` | polishing how the UI *feels*: states, motion, the details of a component |
| `redesign-existing-projects` | upgrading existing screens without rewriting them |
| `ui-ux-pro-max` | picking colours, type, layout or chart form for a new screen |

They are advisory. Where a skill's generic advice meets this codebase, the
codebase wins: the design tokens in `app/globals.css` are the only source of
colour, the POS is German and the Master panel Arabic (`lib/i18n/config.ts`),
and money always flows through `lib/pricing.ts` in integer cents.
