# Contributing to RBOS Portal

This document defines the conventions every contributor — human or agent — follows when working on `rbos-portal`. If you are an agent reading this, treat it as binding.

---

## Branch Naming

Every branch follows the pattern `<type>/<slug>`:

| Type | Use |
|------|-----|
| `feat/` | New features or capabilities |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code restructuring with no behavior change |
| `test/` | Test additions or changes |
| `chore/` | Dependency updates, CI config, tooling |
| `flux/` | FLUX agent working branches (auto-created) |
| `uxui/` | UXUI agent working branches |
| `ioio/` | IOIO agent working branches |
| `doc/` | DOC agent working branches |

Agent branches use their own prefix. A FLUX task to add a health endpoint becomes `flux/add-health-endpoint`.

Slugs are lowercase, hyphen-separated, and under 50 characters. No ticket numbers in branch names — reference issues in the PR body instead.

---

## Commit Messages

Format:

```
<type>: <short description>

<optional body — what and why, not how>
```

Types match the branch types above: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Rules:
- Subject line under 72 characters
- Imperative mood: "add health endpoint", not "added" or "adds"
- No period at the end of the subject line
- Body wrapped at 80 characters
- Reference GitHub issues with `Closes #N` or `Refs #N` in the body, not the subject

Examples:
```
feat: add /health endpoint

Returns { status: 'ok', timestamp: Date.now() } for uptime monitoring.
Closes #5
```

```
docs: add architecture overview

High-level map of the Dojo chat surface, API layer, and agent runtime.
```

---

## Pull Requests

### Opening a PR

Every change to `main` goes through a PR. Direct pushes to `main` are blocked by branch protection.

PR title follows the same `<type>: <description>` format as commit messages.

PR body must include:

```markdown
## What
<1-3 sentences: what changed and why>

## How
<Brief technical summary — which files, what approach>

## Test plan
<How to verify this works — manual steps, automated tests, or "N/A for docs">
```

If the PR was authored by an agent, add the agent name:
```markdown
**Agent:** FLUX
```

### Reviewing a PR

The human reviewer (Alex) is the only merge authority. No agent may merge a PR.

Review checklist:
- [ ] Changes match the PR description
- [ ] No secrets, credentials, or `.env` values in the diff
- [ ] Code follows existing patterns in the codebase
- [ ] For UXUI PRs: deploy preview URL checked on both desktop and mobile
- [ ] For agent PRs: agent's reasoning in the PR body makes sense

### Merging

Use **squash merge** for feature branches to keep `main` history clean. The squash commit message should match the PR title.

Delete the source branch after merge.

---

## Code Style

- **TypeScript** — strict mode, no `any` unless explicitly justified in a comment
- **Svelte 5** — runes mode (`$state`, `$derived`, `$effect`), no legacy reactive declarations
- **Tailwind 4** — utility classes in markup, no custom CSS unless Tailwind cannot express it
- **Formatting** — tabs for indentation (matches SvelteKit defaults), single quotes for strings in JS/TS
- **File naming** — lowercase with hyphens for routes (`+page.svelte`), camelCase for lib modules

---

## Agent-Specific Rules

Agents have the same contribution rights as humans, minus merge authority. Additional rules:

1. **Branch isolation** — agents work only on their own prefixed branches. FLUX does not touch a `uxui/` branch.
2. **One PR per task** — each agent task produces exactly one PR. Don't bundle unrelated changes.
3. **No self-merge** — agents may not approve or merge their own PRs, or any other PR.
4. **No secrets** — agents must not read, write, or reference credentials. The pre-commit scanner will block this, but don't rely on it as your only defense.
5. **Deny-list compliance** — all agent actions are subject to the Runtime Deny-List (D1-D7). See `docs/deny-list.md`.
6. **Standards First** — if DOC has written a spec for the area you're working in, your code conforms to the spec. If there is no spec, ask DOC to write one before you start.
