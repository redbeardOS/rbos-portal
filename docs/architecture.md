# Architecture — RBOS Portal (Dojo)

**Version:** Sprint 1 POC
**Last updated:** 2026-04-05

---

## Overview

The RBOS Portal is the entry surface to the RBOS platform. In Phase 1, it serves one purpose: the **Dojo** — a chat interface where Alex converses with Hive agents (starting with FLUX) and reviews the code they produce.

The architecture has three layers: a SvelteKit frontend that renders the chat, a server-side API layer that bridges to the agent runtime, and the agent runtime itself that manages tool execution and conversation state.

```
┌─────────────────────────────────────────────────┐
│                  Browser (Alex)                  │
│  ┌─────────────────────────────────────────────┐│
│  │         /dojo/chat — Chat Surface           ││
│  │  message list · input bar · status display  ││
│  └─────────────────────────────────────────────┘│
└────────────────────┬────────────────────────────┘
                     │ SSE stream
                     ▼
┌─────────────────────────────────────────────────┐
│              SvelteKit Server                    │
│  ┌─────────────────────────────────────────────┐│
│  │    /api/chat — Chat Endpoint                ││
│  │  receives prompt · returns SSE stream       ││
│  │  manages conversation context (in-memory)   ││
│  └──────────────────┬──────────────────────────┘│
└─────────────────────┼───────────────────────────┘
                      │ Claude API
                      ▼
┌─────────────────────────────────────────────────┐
│              Agent Runtime                       │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ FLUX Agent   │  │   Tool Execution Layer  │  │
│  │ (system      │  │  ┌──────────────────┐   │  │
│  │  prompt +    │  │  │ Git tools        │   │  │
│  │  tools)      │  │  │ File tools       │   │  │
│  │              │◄─┤  │ GitHub API tools  │   │  │
│  │              │  │  └──────────────────┘   │  │
│  └──────────────┘  │  ┌──────────────────┐   │  │
│                    │  │ Deny-List Filter  │   │  │
│                    │  │ (D1-D7 enforced)  │   │  │
│                    │  └──────────────────┘   │  │
│                    └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## Layer 1 — Chat Surface

**Route:** `/dojo/chat`
**Framework:** SvelteKit 2.50 + Svelte 5 (runes) + Tailwind 4

The chat surface is a single page that renders a conversation between Alex and an agent. Sprint 1 targets FLUX only; multi-agent conversations are a later sprint.

### Components

| Component | Responsibility |
|-----------|---------------|
| `MessageList` | Renders an ordered list of message bubbles (user and agent). Subscribes to a reactive store. Auto-scrolls to bottom unless the user has scrolled up. |
| `MessageBubble` | Single message. Displays sender, timestamp, and content. Agent messages support streaming (content grows as tokens arrive). |
| `InputBar` | Text field + send button. Submits on Enter. Disabled while agent is responding. |
| `StatusIndicator` | Shows the agent's current phase: idle, thinking, writing code, committing, waiting for review. Driven by status events in the SSE stream. |

### State Management

Conversation state lives in a Svelte 5 reactive store (`$state` rune). No external state library in Sprint 1.

```typescript
// Simplified shape
interface Message {
  id: string;
  role: 'user' | 'agent';
  agent?: string; // 'FLUX', 'SAM', etc.
  content: string;
  status?: 'streaming' | 'complete' | 'error';
  timestamp: number;
}

interface ChatState {
  messages: Message[];
  agentStatus: 'idle' | 'thinking' | 'coding' | 'committing' | 'error';
  isStreaming: boolean;
}
```

### Streaming Protocol

The frontend opens an SSE connection to `/api/chat` on send. The server streams events:

| Event | Payload | Purpose |
|-------|---------|---------|
| `token` | `{ content: string }` | Append text to current agent message |
| `status` | `{ phase: string }` | Update the StatusIndicator |
| `tool_call` | `{ tool: string, args: object }` | Show what the agent is doing (read file, write file, git commit) |
| `tool_result` | `{ tool: string, result: string }` | Show what the tool returned |
| `pr_opened` | `{ url: string, number: number }` | Link to the PR the agent just opened |
| `done` | `{}` | Agent turn complete |
| `error` | `{ message: string }` | Something went wrong |

---

## Layer 2 — API Layer

**Endpoint:** `POST /api/chat`
**Runtime:** SvelteKit server (Node adapter on Vercel)

The API layer is thin. Its job is to receive a user message, forward it to the agent runtime, and stream the response back as SSE.

### Request

```typescript
POST /api/chat
Content-Type: application/json

{
  "message": "Add a /health endpoint that returns { status: 'ok' }",
  "conversationId": "optional-for-sprint-1"
}
```

### Response

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: status
data: {"phase":"thinking"}

event: token
data: {"content":"I'll add a"}

event: token
data: {"content":" health endpoint"}

...

event: pr_opened
data: {"url":"https://github.com/redbeardOS/rbos-portal/pull/5","number":5}

event: done
data: {}
```

### Conversation Context

Sprint 1 uses in-memory conversation storage. Context is lost on server restart. This is acceptable for a POC — persistent storage (Supabase) arrives in Sprint 2.

The API layer holds a `Map<conversationId, Message[]>` in server memory and passes the full history to the agent on each turn.

---

## Layer 3 — Agent Runtime

The agent runtime manages FLUX's interaction with the Claude API and enforces the two-gate safety model.

### FLUX Configuration

FLUX is configured via a system prompt that defines:
- Role: Staff Architect for RBOS (see `agents/flux-system-prompt.md`)
- Repository context: working on `rbos-portal`, branch naming `flux/<slug>`
- Available tools: file read/write, git operations, GitHub API (PR creation)
- Constraints: the Runtime Deny-List categories (D1-D7)

### Tool Execution

Tools are functions the agent can call during a conversation turn. Each tool call passes through the Deny-List Filter before execution.

**Sprint 1 tool set:**

| Tool | Action | Gate |
|------|--------|------|
| `read_file` | Read a file from the repo | Allowed (Git Gate sufficient) |
| `write_file` | Write/overwrite a file in the working tree | Allowed (Git Gate sufficient) |
| `list_files` | List directory contents | Allowed |
| `run_command` | Execute a shell command (build, lint, test) | Filtered by Deny-List |
| `git_commit` | Stage and commit changes | Allowed on agent branches |
| `git_push` | Push current branch to origin | Allowed on agent branches |
| `github_create_pr` | Open a PR via GitHub API | Allowed (human merges) |

### Deny-List Filter

Before any tool executes, the Deny-List Filter checks the operation against the seven deny categories (D1-D7). If the operation matches any deny rule, it is blocked and the agent receives an error message explaining why.

The filter is enforced at the code level, not by prompt instruction. The agent cannot override it by reasoning its way around it.

See `docs/deny-list.md` for the full category specification.

### Branch Isolation

FLUX creates a working branch `flux/<task-slug>` at the start of each task. All file writes and commits happen on this branch. The agent never touches `main` directly — that is the Git Gate.

When the task is complete, FLUX opens a PR from its branch to `main`. Alex reviews and merges (or rejects). The branch is deleted after merge.

---

## Infrastructure

| Component | Service | Notes |
|-----------|---------|-------|
| Hosting | Vercel (RB79 Pro) | Auto-deploys from `main`, preview deploys per PR |
| Repo | GitHub (redbeardOS/rbos-portal) | Public, MIT license |
| Branch protection | GitHub Rulesets | PR required, force-push blocked, deletion blocked |
| LLM | Anthropic Claude API | FLUX's reasoning engine |
| Database | None in Sprint 1 | Supabase arrives in Sprint 2 |
| Auth | None in Sprint 1 | Magic-link auth arrives in Sprint 2 |

---

## What This Does NOT Cover

- Multi-agent orchestration (SAM critique loop, RedBeard routing) — Sprint 2+
- Persistent conversation storage — Sprint 2 (Supabase)
- Authentication and authorization — Sprint 2 (magic-link)
- Mobile layout and PWA — Sprint 2 (Phase 1 exit gate)
- The Babelfish knowledge layer — separate system, agents read from it
- Production Hive infrastructure (n8n, Mem0, cron) — existing on srv1291263, not part of Portal
