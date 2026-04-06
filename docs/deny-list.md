# Runtime Deny-List — Agent Safety Gate 2

**Status:** Adopted 2026-04-05
**Applies to:** All Hive agents operating on `rbos-portal`
**Enforced by:** Tool execution layer (code-level filter), NOT by prompt instruction

---

## Purpose

The Runtime Deny-List blocks operations that bypass git and therefore cannot be caught by the Git Gate (branch protection). If an action does not appear in the deny list and does not violate the Git Gate, it is allowed.

This file is the consumable specification. The tool execution layer reads these categories and blocks matching operations before they execute.

---

## Deny Categories

### D1 — External Side Effects

**Blocked operations:**
- Sending email, SMS, push notifications, or chat messages (Slack, Discord, Teams)
- Posting to social media platforms
- Calling paid APIs not on the inference allowlist
- Writing to any database table outside the agent's scratch schema
- Any read, write, or enumerate against the FEROS partition

**Why:** These actions have immediate real-world consequences that cannot be undone by rejecting a PR.

### D2 — Destructive Filesystem

**Blocked operations:**
- `rm`, `unlink`, or equivalent on any path outside the agent's working tree
- `rm -rf` on any path (force-recursive delete is always denied; agents delete files individually)
- Modifying files under `/etc`, `/var`, `/usr`, system libraries, or the Docker socket
- Writing to another agent's working tree

**Why:** Filesystem damage outside the repo cannot be caught by git and may be unrecoverable.

### D3 — Secrets and Credentials

**Blocked operations:**
- Reading `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`, SSH private keys, or any file matching the secrets glob
- Reading environment variables matching `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`
- Writing credentials into committed files (also caught by pre-commit secrets scanner)
- Exfiltrating credentials via network request, log output, or commit message

**Why:** Credential exposure is irreversible. The pre-commit scanner is a second line of defense, not the primary one.

### D4 — Network

**Blocked operations:**
- Outbound requests to any host not on the allowlist
- Opening listening sockets that outlive the current task
- Tunneling, VPN, or proxy chain creation

**Allowlist (initial):**
- Anthropic API (`api.anthropic.com`)
- OpenRouter API (`openrouter.ai`)
- GitHub API (`api.github.com`)
- npm registry (`registry.npmjs.org`)
- Supabase project endpoint (when configured)
- Documentation hosts: `svelte.dev`, `tailwindcss.com`, `developer.mozilla.org`

**Why:** Unrestricted network access enables data exfiltration and unauthorized service interaction.

### D5 — Process and Lifetime

**Blocked operations:**
- Spawning detached processes (`nohup`, `setsid`, `disown`, background shells meant to survive session end)
- Writing to crontab, systemd units, or any persistence mechanism
- Modifying the agent's own runtime configuration or deny-list
- Extending a task past its time budget

**Why:** Agents must not persist beyond their task. A rogue background process violates the human-in-the-loop principle.

### D6 — Destructive Database

**Blocked operations:**
- `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE` on any production schema
- Any DDL against `auth.*`, `storage.*`, `realtime.*`, or Supabase-managed schemas
- Writes to production data during development tasks

**Allowed:** Reads from production data for context. Writes to the agent's scratch schema.

**Why:** Database destruction is immediate and may be unrecoverable without backups.

### D7 — Repository Escape

**Blocked operations:**
- `git push` to any remote not in the configured remotes list
- Adding new git remotes
- Cloning repositories outside the allowlisted set
- Reading or writing `.git/config` of any repo other than via normal `git` commands

**Why:** Agents must stay within the boundaries of the repos they are assigned to. Pushing to an unknown remote is a data exfiltration vector.

---

## What Is NOT Denied

The following are deliberately permitted because the Git Gate is sufficient:

- Writing, editing, deleting files inside the agent's working tree
- Running tests, linters, formatters, build tools
- Running the dev server or local containers
- Reading any file inside the repo (including other agents' code)
- Making commits with any message content
- Opening any number of PRs, including large ones
- Disagreeing with a previous agent's decision
- Refactoring code the agent did not write

---

## Enforcement Notes

1. **Code, not prompt.** The deny-list is enforced by the tool execution layer wrapping each tool call. It is not enforced by telling the agent "don't do this" in its system prompt. Prompt-level instructions are advisory; code-level blocks are mandatory.

2. **Fail closed.** If the filter cannot determine whether an operation is allowed (ambiguous path, unknown command), it blocks the operation and returns an error to the agent.

3. **No per-agent variants.** Every agent gets the same deny-list. Role differences are expressed through tool availability and system prompts, not through different deny-list configurations.

4. **Logging.** Every denied operation is logged with: timestamp, agent name, tool name, arguments, and deny category. This log is available to Alex for audit.

---

## Open Items

1. **Enforcement mechanism** — The deny-list needs to be enforced by the runtime, not just documented. Decision pending on Docker sandbox, firejail, OS user restrictions, or a combination. This is the next infrastructure decision after Sprint 1 POC proves the loop.

2. **Secrets scanner** — Choose and wire up gitleaks, trufflehog, or a Supabase-aware variant as the pre-commit hook. Blocks D3 at commit time as a second layer.

3. **Network allowlist curation** — The initial allowlist above is a sketch. The real list should be enumerated from actual agent traffic during the first week of operation, then locked down.
