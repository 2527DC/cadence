# 07 — Claude Code Skills, Plugins and Tooling

App: **Cadence**
Status: **actionable now — install these before implementation starts**
Checked against the official marketplace on 2026-09-02

---

## 0. What a "skill" actually is, so the choices below make sense

A skill is a folder with a `SKILL.md` that gets loaded into my context **only when it is
relevant**. It does not make me smarter in general — it gives me the current, specific,
correct way to do one thing, so I stop guessing from memory.

That distinction drives every recommendation here:

- **Install a skill when the knowledge changes faster than my training data.** Expo SDK
  versions, EAS config, Supabase RLS syntax — these move constantly. This is where skills
  pay for themselves.
- **Do not install a skill for things that do not change.** There is no value in a "React
  hooks" skill. Every installed skill costs context and adds noise.

Your stack is Expo + Supabase, both of which move fast. Skills are genuinely worth it here.

---

## 1. First: refresh your marketplace

Your local marketplace copy is out of date — it does not yet contain the `expo` or
`supabase` plugin folders, even though the manifest lists them. Run this first:

```
/plugin marketplace update claude-plugins-official
```

If you have never added it:

```
/plugin marketplace add anthropics/claude-plugins-official
```

---

## 2. Install these — tier 1 (do this before writing any code)

### 2.1 `expo` — official Expo plugin ⭐ highest value

```
/plugin install expo@claude-plugins-official
/reload-plugins
```

One install gives you **23 official Expo skills plus the Expo MCP server**. Maintained by
the Expo team, so it tracks the SDK.

The ones that matter for Cadence, and where each one lands in the build:

| Skill | Where you will use it |
|---|---|
| `expo-overview` | Router skill — it picks the right one below. Always loaded first. |
| `expo-project-structure` | **Phase P00.** Correct folder layout for a router app from the start. |
| `expo-router` | **P02.** Tabs, stacks, modals, typed routes, deep links. |
| `expo-design-system` | **P02.** Tokens and themes — before you hand-roll styles you regret. |
| `expo-animation` | **P05, P08.** Reanimated + Gesture Handler for the closing sheet, hold-to-record, chat list. |
| `expo-data-fetching` | **P03.** React Query patterns, caching, offline. |
| `expo-native-ui` / `expo-ui` | **P09.** Native-feeling dashboard controls. |
| `expo-dev-client` | **P00.** You need one on day one — native modules mean no Expo Go. |
| `expo-examples` | Any time you integrate a third-party library. ~70 reference projects. |
| `expo-module` | Only if you end up writing native code for audio. Unlikely. |
| `eas-workflows` | **P12.** CI/CD YAML. |
| `eas-app-stores` | **P12.** Store submission, if you ever ship it. |
| `eas-observe` | **P12.** Crash reporting. |
| `expo-upgrade` | Every SDK bump, forever. This one keeps earning. |

> **Note:** it also registers the Expo MCP server, which lets me query live Expo/EAS docs
> instead of recalling them. That is the difference between a correct `app.config.ts` and a
> plausible-looking one.

### 2.2 `supabase` — official Supabase plugin ⭐ highest value

```
/plugin install supabase@claude-plugins-official
/reload-plugins
```

Bundles the Supabase MCP server (~32 tools) **and** agent skills for Postgres/Supabase best
practices. This is the one that changes how the backend work goes, because it lets me:

- **Run and inspect migrations directly** rather than writing SQL and hoping.
- **Verify RLS policies actually deny what they should** — I can execute the "delete a
  finalized task" test and show you the failure, instead of asserting it works.
- Deploy Edge Functions (`transcribe-audio`).
- Generate TypeScript types from the live schema.
- Search Supabase docs at their current version.

For an app whose entire value rests on database-enforced immutability
([03-data-model-supabase.md](03-data-model-supabase.md)), being able to *test the
constraints against a real Postgres* is worth more than any other tool on this list.

⚠️ **Scope it safely:** point the MCP server at a **development project**, and use a
read-only or scoped token where you can. Do not connect it to a database holding data you
cannot afford to lose. Your other work in this folder (`bch-service`, `bike-inventory`)
suggests you have real production Supabase projects around — keep Cadence's connection
separate.

### 2.3 `awesome-react-native-skills` — community React Native depth

```
/plugin marketplace add maikotrindade/awesome-react-native-skills
/plugin install awesome-react-native-skills@awesome-react-native-skills
```

Complements the official Expo plugin rather than duplicating it — this one is React Native
craft, not Expo tooling.

| Skill | Why it matters here |
|---|---|
| `react-native-performance` | **The chat log and notes timeline will get long.** FlashList tuning, re-render profiling. Directly relevant. |
| `react-native-reusables` | shadcn-style components on **NativeWind v4** — matches the styling choice in [02-tech-stack.md](02-tech-stack.md). Saves you building a button library. |
| `react-native-ecosystem` | Library selection with real trade-offs. |
| `react-native-core` | Platform APIs, permissions, native primitives. |
| `react-native-testing` | RN Testing Library patterns for P12. |

Skip `react-native-brownfield-migration` and `upgrading-react-native` — irrelevant to a
greenfield Expo app.

---

## 3. Install these — tier 2 (design and correctness)

### 3.1 `frontend-design` (official)

```
/plugin install frontend-design@claude-plugins-official
```

Design judgement rather than component code: hierarchy, spacing, type scale, colour,
restraint. **Your dashboard is the screen most likely to end up cluttered** — seven metrics
competing for attention. This is the skill that argues for cutting three of them.

### 3.2 `context7` (official)

```
/plugin install context7@claude-plugins-official
```

Pulls **current** documentation for any library on demand. The catch-all for everything not
covered by the Expo and Supabase skills — `expo-speech-recognition`, `victory-native`,
`@gorhom/bottom-sheet`, `date-fns-tz`. Version-accurate docs instead of my recollection of
an older API.

### 3.3 `code-review` (official)

```
/plugin install code-review@claude-plugins-official
```

Run it at the end of each implementation phase, before moving the file from `pending/` to
`completed/`.

### 3.4 `feature-dev` (official)

```
/plugin install feature-dev@claude-plugins-official
```

Gives three sub-agents: `code-explorer`, `code-architect`, `code-reviewer`, plus a
`/feature-dev` command that runs explore → design → implement → review. Useful once the
codebase is big enough that I need to go read it before changing it — roughly from phase
P06 onward.

---

## 4. Consider later — tier 3

| Plugin | When |
|---|---|
| `sentry` | Only if you ship to anyone but yourself. |
| `posthog` | Same. v1 is private; product analytics on a one-user app is noise. |
| `figma` | Only if you actually design in Figma. Skip if you design in code. |
| `superdesign` / `ui-theme-designer` | Palette and theme generation. Nice-to-have; `frontend-design` covers the important part. |
| `playwright` | Web only. Not applicable — use **Maestro** for RN E2E instead. |
| `github` | If you put Cadence in a repo, worth it for PR and issue flow. |

**Explicitly skip:** every LSP plugin except `typescript-lsp` (wrong languages), `firebase`
(wrong backend), the security-scanning plugins (single-user private app), and the "vibe"
plugins.

---

## 5. Custom skills for this project ⭐ the part you specifically asked for

> "i need a skill that thinks on my requirement and how it can be improved when i say
> use this skill and comment or tell about it"

No marketplace plugin does this — they all teach *how to build*, not *whether you should
build it this way*. So this repo carries its own.

### 5.1 `requirement-critic` — **already created for you**

Location: `personal/.claude/skills/requirement-critic/SKILL.md`

Invoke it any of these ways:

```
/requirement-critic
use the requirement-critic skill on the NC status rule
critique this requirement: users should be able to reopen closed tasks
```

What it does — it reads your requirement and comes back with a structured critique:

1. **What you are actually asking for** — restated plainly, so a misunderstanding surfaces
   in one line rather than after two days of building.
2. **Hidden assumptions** — the things the requirement takes for granted without saying so.
3. **Edge cases you have not specified** — the empty state, the concurrent case, the
   "what if the user does this twice" case.
4. **Where it conflicts** with existing rules in `doc/`.
5. **How it could be simpler** — what to cut. Usually the most valuable section.
6. **How it could be stronger** — where it is under-specified rather than over-specified.
7. **What could go wrong in six months** — the maintenance and scale view.
8. **A verdict**: ship as-is / refine first / reconsider — with a reason.

It is deliberately opinionated. It will disagree with you. That is the point — a skill that
agrees with everything is a skill that does nothing.

### 5.2 `cadence-domain` — recommended, build during P01

A short skill holding **the rules that must never be violated**: statuses, immutability,
the mandatory note, the NC semantics, the analytics definitions. Once it exists, every
future session starts already knowing that a finalized task cannot be deleted — so I never
propose a "delete task" button in month four, having forgotten.

**Write it after the schema is real** (end of phase P01), so it describes what was built
rather than what was planned.

### 5.3 `supabase-migrations` — optional, build during P01

Project conventions for migrations: naming, ordering, the rule that nothing is ever changed
via the dashboard, how the immutability triggers are tested. Small, and it prevents the
slow drift into clicking things in the Supabase UI.

---

## 6. Recommended install order

```bash
# 1. refresh
/plugin marketplace update claude-plugins-official

# 2. the two that matter most
/plugin install expo@claude-plugins-official
/plugin install supabase@claude-plugins-official

# 3. React Native depth
/plugin marketplace add maikotrindade/awesome-react-native-skills
/plugin install awesome-react-native-skills@awesome-react-native-skills

# 4. design and correctness
/plugin install frontend-design@claude-plugins-official
/plugin install context7@claude-plugins-official
/plugin install code-review@claude-plugins-official

# 5. reload
/reload-plugins
```

Then `/plugin` to confirm what is active.

---

## 7. Honest assessment of what this buys you

| Plugin | Real impact |
|---|---|
| `supabase` | **Large.** Turns "here is some SQL" into "here is SQL I ran against Postgres, and here is the constraint rejecting the delete". |
| `expo` | **Large.** SDK 57 is newer than my training data. Without this I will confidently give you SDK 52-era APIs — for example `expo-av`, which no longer exists. |
| `awesome-react-native-skills` | Medium. Mostly performance and component patterns. |
| `frontend-design` | Medium. Concentrated on the dashboard, which is the screen at highest risk of being bad. |
| `context7` | Medium. Matters most for the smaller libraries no skill covers. |
| `code-review` / `feature-dev` | Medium, and it grows as the codebase does. Near-zero in week one. |
| `requirement-critic` (custom) | **Depends entirely on whether you use it.** The failure mode of this project is not bad code — it is building the wrong feature carefully. That is what this skill is aimed at. |

**One thing to be honest about:** installing all of these adds context overhead to every
session. If things start feeling sluggish or unfocused, drop tier 3 first, then
`feature-dev`. Keep `expo` and `supabase` regardless — those two are load-bearing.

---

Sources:
- [Expo Skills for AI agents — Expo Documentation](https://docs.expo.dev/skills/)
- [Claude Code and Expo — Expo Documentation](https://docs.expo.dev/agents/claude/)
- [Supabase Plugin for AI Coding Agents — Supabase Docs](https://supabase.com/docs/guides/ai-tools/plugins)
- [Supabase is now an official Claude connector](https://supabase.com/blog/supabase-is-now-an-official-claude-connector)
- [supabase-community/supabase-plugin — GitHub](https://github.com/supabase-community/supabase-plugin)
- [maikotrindade/awesome-react-native-skills — GitHub](https://github.com/maikotrindade/awesome-react-native-skills)
- [expo/skills — GitHub](https://github.com/expo/skills)

Related: [[02-tech-stack]], [[01-product-requirements]]
