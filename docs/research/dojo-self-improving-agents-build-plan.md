# Dojo Self-Improving Agents — Audit, Architecture & Build Instructions

**Date:** 2026-04-07
**Purpose:** Rigorous audit of the Gemini-proposed Dojo architecture against ground truth, followed by a realistic build plan and Claude Code execution instructions. Priority: self-improving agent loops.

---

## Part 1 — Reality Audit: Gemini's Proposal vs. Ground Truth

### What Actually Exists Today (PR #19 on main)

| Feature | Status | Evidence |
|---------|--------|----------|
| FLUX (Staff Architect) | Live | `flux-prompt.ts`, `/api/chat`, tool execution |
| SAM (Critic) | Live | `sam.ts`, auto-triggers on PR, posts GitHub comments |
| Persistent conversations | Merged | Supabase `conversations` + `messages` tables |
| Magic-link auth | Merged | `supabase-auth.ts`, email allowlist |
| Conversation sidebar | Merged | `ConversationSidebar.svelte` |
| Tool execution + deny-list | Live | `tools.ts` — D2/D3 enforced in code |
| Theme system (CSS vars) | Branch exists | `feat/silicon-muse-theme` (unmerged) |
| Mobile responsive | Branch exists | `feat/mobile-adaptive` (unmerged) |
| PWA shell | Branch exists | `feat/pwa-shell` (unmerged) |

| Feature | Status | Evidence |
|---------|--------|----------|
| Agent Registry | NOT BUILT | Handoff spec exists, zero code |
| DOC, IOIO, QAE, UXUI agents | NOT BUILT | Handoff specs exist, zero code |
| RedBeard router | NOT BUILT | Mentioned in docs only |
| Agent memory / learning | NOT BUILT | Research recommendation only |
| LightRAG / Babelfish | NOT BUILT | Zero code, zero infrastructure |
| Ollama | NOT BUILT | Zero references in codebase |
| MinerU / Crawl4AI | NOT BUILT | Zero references in codebase |
| Playwright / Vitest | NOT BUILT | Zero references, not in package.json |
| ZAP / OWASP MCP | NOT BUILT | Does not exist as described |
| n8n integration | NOT BUILT | n8n runs on srv1291263 but no Portal integration |
| Headless execution | NOT BUILT | No cron, no scheduler |

### Gemini Proposal — Line-by-Line Verdict

**FLUX using LightRAG + OpenDevin:**
- LightRAG: Valid concept. Not built. Requires Docker service deployment on srv1291263, new `babelfish_query` tool, D4 allowlist update. Realistic for Phase 3.
- OpenDevin: **Not viable.** OpenDevin is a separate autonomous coding agent product, not a library you import. The Dojo already IS the agent execution environment. This is a conceptual misunderstanding. What Gemini likely means is "FLUX uses the agentic loop to do multi-file refactors" which FLUX already does via its tool set.

**DOC using MinerU + Crawl4AI:**
- MinerU: Valid. Open-source PDF-to-markdown parser. Runs as a Python service. Heavy dependency (needs GPU for best results). Would need a Docker container on srv1291263. Realistic for Phase 3.
- Crawl4AI: Valid. Open-source web scraper. Lightweight Python service. Could run alongside MinerU. Would feed DOC with live API documentation. Realistic for Phase 3.
- **Blocker:** DOC agent doesn't exist yet. Agent Registry must be built first.

**SAM using Playwright MCP + Vitest:**
- Playwright MCP: **Partially valid.** There's no "Playwright MCP" product. However, SAM could use Playwright (the testing framework) to verify UI changes by taking screenshots and running E2E tests. This would be a new tool added to SAM's capabilities, not an MCP server.
- Vitest: Valid. Standard test runner. Could be integrated as a `run_tests` tool. The Dojo is serverless on Vercel, so test execution would need to happen via GitHub Actions or a CI runner, not in the Dojo's serverless runtime.
- **Blocker:** SAM currently has zero tools (reviews diffs only). Adding tools to SAM is a design decision — SAM's value is as a pure critic, not an executor.

**IOIO managing Ollama + Supabase + n8n:**
- Ollama: Valid concept for local inference. Would reduce OpenRouter token costs for routine tasks. Requires Docker on srv1291263. The Dojo itself can't run Ollama (serverless).
- Supabase: Already integrated. IOIO would manage migrations — valid.
- n8n: Already deployed on srv1291263. Integration via webhook triggers — valid.
- **Blocker:** IOIO agent doesn't exist yet.

**UXUI using Svelte 5 + Tailwind 4:**
- This is just... the existing tech stack. Not a special integration. Valid but trivially true.
- **Blocker:** UXUI agent doesn't exist yet.

**QAE using ZAP + OWASP MCP:**
- ZAP: Valid security scanner. Could be run as a CI step. Would not be an "MCP" — it would be a tool QAE invokes.
- OWASP MCP: **Does not exist** as a product. OWASP is a standards body, not a software tool you install. Gemini conflated OWASP guidelines with a hypothetical MCP server.
- **Blocker:** QAE agent doesn't exist yet.

### Verdict Summary

Gemini's proposal has **sound architectural instincts** (multi-agent specialization, knowledge graphs, self-improvement loops, local inference) but is **detached from the actual build state.** It describes a Phase 3+ vision as if it's deployable now, when the codebase hasn't even built the Agent Registry (the Phase 2 foundation). Several specific tool references (OpenDevin, OWASP MCP, Playwright MCP) are either misnamed or don't exist.

The three workflow loops (Research-to-Code, Self-Improvement, DevOps Orchestration) are architecturally valid and should be the target — but they need to be built incrementally on top of the foundation that doesn't exist yet.

---

## Part 2 — Self-Improving Agent Architecture

This is the core innovation request. Here's the architecture, designed to work within the Dojo's constraints (serverless Vercel frontend, Supabase persistence, human-in-the-loop principle).

### What "Self-Improving" Means

A self-improving agent gets better at its job over time without manual prompt editing. It does this through three mechanisms:

1. **Memory** — Persists learned preferences, patterns, and decisions across sessions
2. **Feedback Absorption** — Integrates SAM's critiques and Alex's PR review comments into future behavior
3. **Skill Acquisition** — Converts successful patterns into reusable instruction sets

### Data Model

```sql
-- Migration: 002_agent_memory.sql

-- Per-agent persistent memory
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,              -- 'flux', 'doc', 'ioio', etc.
  category TEXT NOT NULL,              -- 'preference', 'pattern', 'warning', 'skill'
  key TEXT NOT NULL,                   -- Semantic key (e.g., 'component-extraction-threshold')
  value JSONB NOT NULL,                -- Structured memory content
  confidence REAL DEFAULT 0.5,         -- 0.0-1.0, increases with reinforcement
  source TEXT,                         -- What created this memory (PR #, SAM review, Alex comment)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, key)
);

-- SAM feedback that feeds the improvement loop
CREATE TABLE agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,              -- Agent that received feedback
  source_agent TEXT NOT NULL,          -- 'sam', 'alex' (human)
  pr_number INTEGER,                   -- Associated PR
  feedback_type TEXT NOT NULL,         -- 'approve', 'request_changes', 'pattern', 'anti_pattern'
  content TEXT NOT NULL,               -- The actual feedback
  applied BOOLEAN DEFAULT false,       -- Whether this has been absorbed into memory
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Successful patterns that become skills
CREATE TABLE agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  description TEXT NOT NULL,
  instruction_text TEXT NOT NULL,       -- The actual skill content (loaded into context on demand)
  trigger_pattern TEXT,                -- When to auto-load this skill
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,       -- Tracks how often this skill leads to APPROVE
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, skill_name)
);

CREATE INDEX idx_memory_agent ON agent_memory(agent_id);
CREATE INDEX idx_feedback_agent ON agent_feedback(agent_id, applied);
CREATE INDEX idx_skills_agent ON agent_skills(agent_id);
```

### The Self-Improvement Loop

```
┌──────────────────────────────────────────────────────────┐
│                    THE IMPROVEMENT LOOP                    │
│                                                          │
│  ┌─────────┐    ┌──────────┐    ┌──────────────────┐    │
│  │  AGENT   │───▶│  WRITES  │───▶│  OPENS PR        │    │
│  │  (FLUX)  │    │  CODE    │    │  on flux/branch   │    │
│  └─────────┘    └──────────┘    └────────┬─────────┘    │
│       ▲                                   │              │
│       │                                   ▼              │
│  ┌────┴────────────────┐    ┌──────────────────────┐    │
│  │  LOAD MEMORY        │    │  SAM REVIEWS         │    │
│  │  + RELEVANT SKILLS  │    │  (adversarial)       │    │
│  │  into system prompt │    └────────┬─────────────┘    │
│  └─────────────────────┘             │                   │
│       ▲                              ▼                   │
│       │                 ┌──────────────────────┐         │
│       │                 │  FEEDBACK STORED      │         │
│       │                 │  in agent_feedback     │         │
│       │                 └────────┬─────────────┘         │
│       │                          │                        │
│       │                          ▼                        │
│       │                 ┌──────────────────────┐         │
│       │                 │  ABSORB LOOP          │         │
│       │                 │  (between sessions)   │         │
│       │                 │                       │         │
│       │                 │  1. Read unabsorbed    │         │
│       │                 │     feedback           │         │
│       │                 │  2. Extract patterns   │         │
│       │                 │  3. Update memory      │         │
│       │                 │  4. Create/update      │         │
│       │                 │     skills             │         │
│       │                 │  5. Mark absorbed      │         │
│       │                 └────────┬─────────────┘         │
│       │                          │                        │
│       └──────────────────────────┘                        │
└──────────────────────────────────────────────────────────┘
```

### How Memory Loads Into Agent Context

At session start, the agent runtime:

1. Queries `agent_memory` for the active agent, ordered by confidence DESC
2. Queries `agent_skills` for skills matching the task context
3. Injects a `## Learned Preferences` section into the system prompt
4. Injects relevant skill instructions as `## Active Skills`

```typescript
// Pseudocode for memory-enhanced prompt construction
async function buildAgentPrompt(agentConfig: AgentConfig, taskContext: string): Promise<string> {
  const memories = await supabase
    .from('agent_memory')
    .select('*')
    .eq('agent_id', agentConfig.id)
    .gte('confidence', 0.3)
    .order('confidence', { ascending: false })
    .limit(20);

  const skills = await supabase
    .from('agent_skills')
    .select('*')
    .eq('agent_id', agentConfig.id)
    .order('success_rate', { ascending: false })
    .limit(5);

  let prompt = agentConfig.systemPrompt;

  if (memories.data?.length) {
    prompt += '\n\n## Learned Preferences\n\n';
    prompt += 'These are patterns you have learned from past work and feedback:\n\n';
    for (const m of memories.data) {
      prompt += `- **${m.key}** (confidence: ${m.confidence}): ${JSON.stringify(m.value)}\n`;
    }
  }

  if (skills.data?.length) {
    prompt += '\n\n## Active Skills\n\n';
    for (const s of skills.data) {
      prompt += `### ${s.skill_name}\n${s.instruction_text}\n\n`;
    }
  }

  return prompt;
}
```

### The Absorb Loop (Between Sessions)

This is a headless process that runs after a PR is merged or rejected:

1. Query `agent_feedback` where `applied = false` for the agent
2. For each feedback item, use a lightweight LLM call (Haiku or Ollama) to:
   - Classify: Is this a new preference, a reinforcement of an existing one, or a correction?
   - Extract: What's the actionable pattern?
   - Score: How confident should we be? (first occurrence: 0.3, reinforced: +0.1 each time, Alex confirms: 0.8+)
3. Upsert into `agent_memory`
4. If a pattern has been reinforced 3+ times, promote it to `agent_skills`
5. Mark feedback as `applied = true`

### SAM as the Feedback Engine

SAM's review already produces structured output (APPROVE/REQUEST_CHANGES/COMMENT with issues and severity). The enhancement is to persist this feedback:

```typescript
// After SAM posts a review, also store structured feedback
async function storeSamFeedback(agentId: string, prNumber: number, review: SamReview) {
  for (const issue of review.issues) {
    await supabase.from('agent_feedback').insert({
      agent_id: agentId,
      source_agent: 'sam',
      pr_number: prNumber,
      feedback_type: issue.severity === 'critical' ? 'anti_pattern' : 'pattern',
      content: `${issue.file}:${issue.line} — ${issue.description}`,
    });
  }
  if (review.verdict === 'APPROVE') {
    // Reinforce whatever the agent did well
    await supabase.from('agent_feedback').insert({
      agent_id: agentId,
      source_agent: 'sam',
      pr_number: prNumber,
      feedback_type: 'approve',
      content: review.summary,
    });
  }
}
```

### Alex as the Authority Signal

When Alex merges a PR, that's the strongest positive signal. When Alex rejects or requests changes, that's the strongest corrective signal. The Dojo should capture these:

```typescript
// Webhook or poll: when a PR is merged by Alex
async function onPrMerged(prNumber: number, agentId: string) {
  // Boost confidence of all memories that contributed to this PR
  const relatedFeedback = await supabase
    .from('agent_feedback')
    .select('*')
    .eq('pr_number', prNumber)
    .eq('feedback_type', 'approve');
  // ... boost confidence of related memories
}
```

---

## Part 3 — Phased Build Plan

### Phase 2A — Foundation (Agent Registry + Memory Schema)

**Prerequisite for everything.** Cannot build self-improving agents without the ability to register and route to multiple agents.

| Task | Scope | Depends On |
|------|-------|------------|
| Build Agent Registry | `src/lib/server/agents/registry.ts`, extract FLUX/SAM configs | Nothing |
| Agent Selector UI | `AgentSelector.svelte`, agent store, `/api/agents` endpoint | Registry |
| Route `/api/chat` to selected agent | Update `+server.ts` to dispatch by agent ID | Registry |
| Create `agent_memory` migration | `002_agent_memory.sql` (memory, feedback, skills tables) | Supabase access |
| Memory-loading prompt builder | `buildAgentPrompt()` in agent runtime | Registry + migration |
| New tools: `read_memory`, `write_memory` | Agents can read/write their own memory | Registry + migration |

### Phase 2B — Agent Swarm (DOC, IOIO, QAE, UXUI)

| Task | Scope | Depends On |
|------|-------|------------|
| DOC agent config | `agents/doc.ts` — spec author, tools: read_file, write_file, list_files | Registry |
| IOIO agent config | `agents/ioio.ts` — implementer, full tool set | Registry |
| QAE agent config | `agents/qae.ts` — validator, tools: read_file, list_files (read-only + test runner) | Registry |
| UXUI agent config | `agents/uxui.ts` — UI specialist, full tool set | Registry |
| SAM feedback persistence | Store SAM reviews in `agent_feedback` table | Migration |
| Alex merge/reject signals | Capture PR merge/reject events, write to `agent_feedback` | Migration + GitHub webhook |

### Phase 2C — Self-Improvement Loop

| Task | Scope | Depends On |
|------|-------|------------|
| Absorb loop service | Headless process: reads unabsorbed feedback, extracts patterns, updates memory | Phase 2B complete |
| Memory injection into prompts | `buildAgentPrompt()` loads memories + skills at session start | Phase 2A |
| Skill promotion | Auto-promote patterns reinforced 3+ times to `agent_skills` | Absorb loop |
| Confidence decay | Memories not reinforced in 30 days lose 0.1 confidence | Cron job |
| Memory dashboard | UI for Alex to view/edit/delete agent memories | Phase 2A |

### Phase 3A — Knowledge Layer (Babelfish)

| Task | Scope | Depends On |
|------|-------|------------|
| LightRAG deployment | Docker container on srv1291263, API endpoint | Server access |
| Document ingestion pipeline | Index `/docs`, specs, architecture files into LightRAG | LightRAG running |
| `babelfish_query` tool | New tool for all agents to query the knowledge graph | LightRAG + D4 allowlist update |
| MinerU deployment | Docker container for PDF-to-markdown parsing | Server access |
| RAG-Anything integration | Multi-modal ingestion (PDF specs, images) into LightRAG | MinerU + LightRAG |
| Crawl4AI for live docs | Scrape Svelte, Tailwind, Supabase docs into LightRAG | LightRAG |

### ~~Phase 3B~~ → MOVED TO PHASE 2A-0: Local Inference (Ollama)

**Ollama is now foundational infrastructure, deployed FIRST alongside the Agent Registry.**

See revised execution order and the new Phase 2A-0 section below.

### Phase 3C — Headless Execution

| Task | Scope | Depends On |
|------|-------|------------|
| `/api/headless` endpoint | Accepts task definition, runs agent loop, stores results | Agent Registry |
| n8n webhook integration | n8n on srv1291263 triggers headless tasks on schedule | n8n + endpoint |
| Nightly build verification | Headless FLUX runs `npm run build`, reports failures | Headless endpoint |
| Weekly dependency audit | Headless QAE scans for outdated/vulnerable deps | Headless + QAE agent |
| Agent reports UI | View headless task results in Dojo | Headless endpoint |

---

## Part 4 — Claude Code Build Instructions

These are copy-paste-ready prompts for Claude Code sessions. Each builds one discrete piece. Run them in order within each phase; phases can overlap where dependencies allow.

**CRITICAL: Every prompt below includes a checkpoint instruction.** After completing each phase, Claude Code updates `DOJO-BUILD-STATE.md` at the repo root. This is how sessions survive resets — the next session reads that file first and knows exactly where to pick up.

### Session Bootstrap Prompt (USE THIS FIRST IN EVERY NEW SESSION)

```
You are resuming work on the RBOS Dojo Self-Improving Agents build.

BEFORE doing anything else:
1. Read DOJO-BUILD-STATE.md at the repo root — this is your ground truth
2. Read docs/research/dojo-self-improving-agents-build-plan.md — this is the full plan
3. Check git status and git log --oneline -10 to see what's in flight
4. Check for any open branches with: git branch -a | grep -v main

Based on DOJO-BUILD-STATE.md:
- If a phase is marked IN_PROGRESS, continue it
- If a phase is marked COMPLETE, move to the next NOT_STARTED phase
- If there are blockers listed, address those first
- Read any "Session Handoff Notes" at the bottom — the previous session may have left context

Report what you found and what you plan to do next. Wait for confirmation before proceeding.
```

---

### Phase 2A-0: Ollama Infrastructure (srv1291263)

_(See Addendum at end of document for the full Ollama deployment prompt and client module prompt)_

**After completing Phase 2A-0, run this checkpoint:**

```
Update DOJO-BUILD-STATE.md:

1. Change "2A-0: Ollama Infrastructure" status to COMPLETE, fill in branch and PR columns
2. Change "2A-0: Ollama Client Module" status to COMPLETE if both parts done
3. Under "Session Handoff Notes", add:
   - The actual Ollama API endpoint URL
   - Which models were pulled and verified
   - Any performance observations (actual tok/s measured)
   - Any issues encountered during deployment
4. Update "Current Phase" to the next incomplete phase
5. Update "Last updated" date
6. Commit: docs: update build state after Phase 2A-0 (Ollama)
```

---

### Phase 2A-1: Agent Registry

```
Build the Agent Registry for the RBOS Portal Dojo.

FIRST: Read DOJO-BUILD-STATE.md to confirm prerequisites are met and this phase is next.

Read the handoff spec at .claude-handoff/p2-agent-registry/HANDOFF.md — it has the complete implementation specification including TypeScript interfaces, file-by-file changes, and verification checklist.

Key points:
- Create src/lib/server/agents/registry.ts with the AgentConfig interface and AGENTS map
- Extract FLUX config from flux-prompt.ts into src/lib/server/agents/flux.ts
- Extract SAM config into src/lib/server/agents/sam.ts
- Replace flux-prompt.ts with backward-compat re-exports
- Make TaskContext in tools.ts agent-aware (accept agentId, use agent's branchPrefix)
- Add getToolsForAgent() to tools.ts
- Update /api/chat/+server.ts to accept an `agent` field in the request body and route to the correct agent config
- Create /api/agents/+server.ts that returns selectable agents for the UI
- Create src/lib/stores/agents.svelte.ts for agent selection state (Svelte 5 runes)
- Create src/lib/components/AgentSelector.svelte — dropdown in the chat header
- Integrate AgentSelector into dojo/chat/+page.svelte
- Update InputBar placeholder to show selected agent name

Branch: feat/agent-registry

Verify:
- FLUX still works as default agent (same prompt, tools, branch prefix)
- SAM auto-review still triggers
- /api/agents returns selectable agents
- Agent selector appears in header
- Sending message with agent param routes correctly
- Unknown agent ID returns 400
- Non-selectable agent returns 400
- Agent name in persisted messages matches selection

Do NOT add DOC/IOIO/QAE/UXUI configs — those come in separate PRs after this merges.

CHECKPOINT: After completing this phase, update DOJO-BUILD-STATE.md:
- Set "2A-1: Agent Registry" to COMPLETE with branch name and PR number
- Under "Session Handoff Notes", note any deviations from the handoff spec
- Update "Current Phase" to "2A-2: Memory Schema"
- Commit: docs: update build state after Phase 2A-1 (Agent Registry)
```

---

### Phase 2A-2: Agent Memory Schema

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A-1 is COMPLETE and this phase is next.

Create the agent memory, feedback, and skills database schema for the self-improving agent system.

Context: The RBOS Dojo agents need to learn from their work over time. This migration adds three tables to Supabase that enable persistent memory, feedback tracking, and skill acquisition.

Create file: supabase/migrations/002_agent_memory.sql

Tables:

1. agent_memory — Per-agent persistent learned preferences
   - id UUID PK DEFAULT gen_random_uuid()
   - agent_id TEXT NOT NULL (e.g., 'flux', 'doc')
   - category TEXT NOT NULL ('preference', 'pattern', 'warning', 'skill')
   - key TEXT NOT NULL (semantic key like 'component-extraction-threshold')
   - value JSONB NOT NULL (structured memory content)
   - confidence REAL DEFAULT 0.5 (0.0-1.0, increases with reinforcement)
   - source TEXT (what created this: 'PR #12', 'SAM review', 'Alex comment')
   - created_at TIMESTAMPTZ DEFAULT now()
   - updated_at TIMESTAMPTZ DEFAULT now()
   - UNIQUE(agent_id, key)

2. agent_feedback — Feedback from SAM and Alex that feeds the improvement loop
   - id UUID PK DEFAULT gen_random_uuid()
   - agent_id TEXT NOT NULL
   - source_agent TEXT NOT NULL ('sam', 'alex')
   - pr_number INTEGER
   - feedback_type TEXT NOT NULL ('approve', 'request_changes', 'pattern', 'anti_pattern')
   - content TEXT NOT NULL
   - applied BOOLEAN DEFAULT false
   - created_at TIMESTAMPTZ DEFAULT now()

3. agent_skills — Successful patterns promoted to reusable skills
   - id UUID PK DEFAULT gen_random_uuid()
   - agent_id TEXT NOT NULL
   - skill_name TEXT NOT NULL
   - description TEXT NOT NULL
   - instruction_text TEXT NOT NULL (actual skill content loaded into context)
   - trigger_pattern TEXT (when to auto-load)
   - usage_count INTEGER DEFAULT 0
   - success_rate REAL DEFAULT 0.0
   - created_at TIMESTAMPTZ DEFAULT now()
   - updated_at TIMESTAMPTZ DEFAULT now()
   - UNIQUE(agent_id, skill_name)

Add indexes on agent_id for all three tables, plus (agent_id, applied) for feedback.

Branch: feat/agent-memory-schema

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2A-2 to COMPLETE, note any schema changes, set current phase to 2A-3. Commit: docs: update build state after Phase 2A-2 (Memory Schema)
```

---

### Phase 2A-3: Memory-Enhanced Prompt Builder

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phases 2A-1 and 2A-2 are COMPLETE.

Build the memory-loading prompt builder that injects learned preferences and skills into agent system prompts at session start.

Context: After the Agent Registry (feat/agent-registry) and memory schema (feat/agent-memory-schema) are merged, agents need to actually load their accumulated knowledge.

Read the current agent runtime in:
- src/lib/server/agents/registry.ts (AgentConfig interface)
- src/routes/api/chat/+server.ts (where system prompts are constructed)
- src/lib/server/supabase.ts (server-side Supabase client)

Create: src/lib/server/agents/memory.ts

This module exports:

1. buildAgentPrompt(agentConfig: AgentConfig, taskHint?: string): Promise<string>
   - Queries agent_memory for this agent where confidence >= 0.3, ordered by confidence DESC, limit 20
   - Queries agent_skills for this agent where success_rate > 0.0, ordered by success_rate DESC, limit 5
   - Appends a "## Learned Preferences" section to the system prompt with memory entries
   - Appends a "## Active Skills" section with skill instruction_text
   - If taskHint is provided, filter skills by trigger_pattern match
   - Returns the enhanced prompt string

2. recordFeedback(agentId: string, sourceAgent: string, prNumber: number, feedbackType: string, content: string): Promise<void>
   - Inserts into agent_feedback table

3. boostMemoryConfidence(agentId: string, key: string, boost: number): Promise<void>
   - Updates confidence = MIN(1.0, confidence + boost) for the given memory entry

Update: src/routes/api/chat/+server.ts
- Import buildAgentPrompt
- Replace direct use of agentConfig.systemPrompt with: await buildAgentPrompt(agentConfig)
- This is the only change to the chat endpoint

Update: src/lib/server/sam.ts
- After SAM posts a review, call recordFeedback() to persist the feedback
- Parse SAM's structured output (issues array) into individual feedback entries
- APPROVE verdict → feedback_type: 'approve'
- REQUEST_CHANGES with critical issues → feedback_type: 'anti_pattern'
- REQUEST_CHANGES with non-critical → feedback_type: 'pattern'

Branch: feat/agent-memory-loader

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2A-3 to COMPLETE, note the Ollama endpoint used for memory extraction, set current phase to 2A-4. Commit: docs: update build state after Phase 2A-3 (Memory Prompt Builder)
```

---

### Phase 2A-4: Agent Memory Tools

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phases 2A-1 through 2A-3 are COMPLETE.

Add read_memory and write_memory tools so agents can read and update their own persistent memory during a session.

Context: Agents need to be able to save insights they discover during work. For example, if FLUX discovers that a particular pattern works well for Svelte 5 runes, it should be able to save that for future sessions.

Read:
- src/lib/server/tools.ts (existing tool definitions and executeTool router)
- src/lib/server/agents/registry.ts (AgentConfig, to check agent permissions)

Add two new tool definitions to TOOL_DEFINITIONS:

1. read_memory
   - Parameters: category (optional string), key (optional string)
   - Returns: JSON array of memory entries matching the filter
   - If no params, returns all memories for the current agent (limit 20)
   - Agents can ONLY read their own memories (filter by ctx.agentId)

2. write_memory
   - Parameters: category (required: 'preference'|'pattern'|'warning'), key (required string), value (required object), source (optional string)
   - Upserts into agent_memory for the current agent
   - If key already exists, update value and bump confidence by 0.1
   - If new, insert with confidence 0.3
   - Agents can ONLY write their own memories

Add these tools to the executeTool switch statement.

Update TaskContext to carry agentId (it should already from the registry work).

Add both tools to FLUX's tool list in agents/flux.ts. Also add to any other agent configs that exist.

Do NOT add a delete_memory tool — Alex manages memory cleanup via the dashboard (future).

Branch: feat/agent-memory-tools

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2A-4 to COMPLETE. Phase 2A is now DONE. Note: "Phase 2A complete — Agent Registry + Memory system operational. Phase 2B (Agent Swarm) can begin. All 2B agents can be built in parallel." Set current phase to 2B. Commit: docs: update build state after Phase 2A-4 (Memory Tools) — Phase 2A complete
```

---

### Phase 2B-1: DOC Agent

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A is COMPLETE (Agent Registry merged).

Add the DOC (Spec Author) agent to the Hive.

Read the handoff spec: .claude-handoff/p2-agent-doc/HANDOFF.md
Read the registry: src/lib/server/agents/registry.ts

Create: src/lib/server/agents/doc.ts

DOC's identity:
- Spec Author on the RBOS Hive dev team
- Writes specifications, schemas, TypeScript interfaces, API contracts, architecture docs
- Does NOT write application code
- Uses the Standards First methodology: draft spec → FLUX architecture review → SAM adversarial review → revise → IOIO implements
- Commit prefix: docs:
- Branch prefix: doc/
- Tools: read_file, write_file, list_files, git_commit, github_create_pr, read_memory, write_memory

Register DOC in the AGENTS map in registry.ts.
Set selectable: true, color: 'var(--text-muted)' (or a distinct CSS variable).

Branch: feat/agent-doc

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2B-1 to COMPLETE. Commit: docs: update build state after Phase 2B-1 (DOC Agent)
```

---

### Phase 2B-2: IOIO Agent

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A is COMPLETE (Agent Registry merged).

Add the IOIO (Implementer) agent to the Hive.

Read the handoff spec: .claude-handoff/p2-agent-ioio/HANDOFF.md
Read the registry: src/lib/server/agents/registry.ts

Create: src/lib/server/agents/ioio.ts

IOIO's identity:
- Implementer on the RBOS Hive dev team
- Takes approved specs from DOC and implements them as working code
- Does NOT make architectural decisions — follows specs precisely
- When a spec is ambiguous, flags it rather than improvising
- Branch prefix: ioio/
- Tools: read_file, write_file, list_files, git_commit, github_create_pr, read_memory, write_memory

Register in AGENTS map. Set selectable: true.

Branch: feat/agent-ioio

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2B-2 to COMPLETE. Commit: docs: update build state after Phase 2B-2 (IOIO Agent)
```

---

### Phase 2B-3: QAE Agent

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A is COMPLETE (Agent Registry merged).

Add the QAE (Quality Assurance Engineer) agent to the Hive.

Read the handoff spec: .claude-handoff/p2-agent-qae/HANDOFF.md
Read the registry: src/lib/server/agents/registry.ts

Create: src/lib/server/agents/qae.ts

QAE's identity:
- Quality Assurance Engineer
- Validates implementations match specs
- Writes test specs, validation checklists, test data fixtures
- Methodical and skeptical — assumes code is broken until proven otherwise
- Read-heavy: primarily uses read_file and list_files
- Branch prefix: qae/
- Tools: read_file, list_files, write_file, git_commit, github_create_pr, read_memory, write_memory

Register in AGENTS map. Set selectable: true.

Branch: feat/agent-qae

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2B-3 to COMPLETE. Commit: docs: update build state after Phase 2B-3 (QAE Agent)
```

---

### Phase 2B-4: UXUI Agent

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A is COMPLETE (Agent Registry merged).

Add the UXUI (UI/UX Specialist) agent to the Hive.

Read the handoff spec: .claude-handoff/p2-agent-uxui/HANDOFF.md
Read the registry: src/lib/server/agents/registry.ts

Create: src/lib/server/agents/uxui.ts

UXUI's identity:
- UI/UX Specialist
- Builds Svelte 5 components, responsive layouts, accessibility, visual polish
- Works within the established design system (CSS custom properties, 7 themes, 20 tokens each)
- Branch prefix: uxui/
- Tools: read_file, write_file, list_files, git_commit, github_create_pr, read_memory, write_memory

Register in AGENTS map. Set selectable: true.

Branch: feat/agent-uxui

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2B-4 to COMPLETE. If all 2B phases are done, note: "Phase 2B complete — Full agent swarm operational (FLUX, DOC, IOIO, QAE, UXUI + SAM critic). Phase 2C (Self-Improvement Loop) can begin." Set current phase to 2C. Commit: docs: update build state after Phase 2B-4 (UXUI Agent)
```

---

### Phase 2C-1: Absorb Loop (Self-Improvement Engine)

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2B is COMPLETE (all agents registered, SAM feedback persistence working).

Build the feedback absorption loop — the core self-improvement engine for Dojo agents.

Context: This is a server-side process (NOT a UI feature) that runs periodically to convert raw SAM/Alex feedback into structured agent memories and skills. It's the engine that makes agents get smarter over time.

Read:
- supabase/migrations/002_agent_memory.sql (schema)
- src/lib/server/agents/memory.ts (memory module)
- src/lib/server/sam.ts (how SAM generates feedback)

Create: src/lib/server/agents/absorb.ts

This module exports:

1. absorbFeedback(agentId: string): Promise<AbsorbResult>
   - Queries agent_feedback WHERE agent_id = agentId AND applied = false
   - For each feedback item:
     a. If feedback_type is 'approve': boost confidence of memories tagged with this PR's task area
     b. If feedback_type is 'anti_pattern': check if a memory exists with a related key
        - If yes: update the memory value with the corrective information, reset confidence to 0.5
        - If no: create a new memory with category='warning', confidence=0.4
     c. If feedback_type is 'pattern': check if memory exists
        - If yes: boost confidence by 0.1
        - If no: create with category='pattern', confidence=0.3
     d. If feedback_type is 'request_changes': create warning memory
   - Mark all processed feedback as applied = true
   - Return: { processed: number, memoriesCreated: number, memoriesUpdated: number, skillsPromoted: number }

2. promoteSkills(agentId: string): Promise<number>
   - Query agent_memory WHERE agent_id = agentId AND confidence >= 0.7 AND category = 'pattern'
   - For each high-confidence pattern that doesn't already have a corresponding skill:
     - Create an agent_skills entry with:
       - skill_name derived from the memory key
       - instruction_text generated from the memory value (format as a concise instruction)
       - trigger_pattern derived from the memory category
       - success_rate = confidence value
   - Return count of skills promoted

3. decayMemories(): Promise<number>
   - Reduce confidence by 0.05 for all memories not updated in the last 30 days
   - Delete memories where confidence drops below 0.1
   - Return count of decayed/deleted entries

Create: src/routes/api/absorb/+server.ts

POST endpoint (protected — only callable by n8n webhook or internal cron):
- Accepts { agentId?: string } — if omitted, runs for all agents
- Calls absorbFeedback() then promoteSkills() for each agent
- Returns the AbsorbResult
- Logs results for audit

This endpoint will be triggered by n8n on srv1291263 (daily cron) or can be called manually for testing.

Branch: feat/agent-absorb-loop

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2C-1 to COMPLETE. Note: "Self-improvement loop is LIVE. Agents now learn from SAM feedback. Run absorb loop manually to test: POST /api/absorb with agentId." Include the measured Ollama performance for the absorb task. Commit: docs: update build state after Phase 2C-1 (Absorb Loop)
```

---

### Phase 2C-2: Memory Dashboard

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A (memory schema) and 2C-1 (absorb loop) are COMPLETE.

Build a simple admin view for Alex to inspect and manage agent memories.

Context: Self-improving agents need human oversight. Alex should be able to see what agents have learned, correct wrong memories, and delete memories that are causing problems.

Read:
- src/routes/dojo/chat/+page.svelte (to understand the existing UI patterns)
- src/lib/stores/ (for store patterns)
- supabase/migrations/002_agent_memory.sql (schema)

Create: src/routes/dojo/memory/+page.svelte

Page layout:
- Agent tabs at the top (one per registered agent)
- Three sections per agent: Memories, Feedback (recent), Skills
- Memories table: key, category, confidence (visual bar), value (truncated), source, updated_at
  - Click to expand full value
  - Delete button per row (with confirm)
  - Edit confidence slider
- Feedback table: date, source, PR#, type, content, applied status
- Skills table: name, description, usage_count, success_rate, toggle enabled/disabled

Create: src/routes/api/memory/+server.ts
- GET: returns memories for a given agent_id (query param)
- DELETE: deletes a specific memory by id
- PATCH: updates confidence or value for a memory

Style with existing CSS custom properties and Tailwind. Match the Dojo design language.

Branch: feat/agent-memory-dashboard

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 2C-2 to COMPLETE. Note: "Phase 2 FULLY COMPLETE. Self-improving agent ecosystem is operational: agent swarm + memory + feedback loop + dashboard. Phase 3 (Knowledge Layer + Headless) can begin." This is a MAJOR MILESTONE. Commit: docs: update build state after Phase 2C-2 — PHASE 2 COMPLETE
```

---

### Phase 3A-1: LightRAG Deployment (srv1291263)

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 2A-0 (Ollama) is COMPLETE and running on srv1291263.

Deploy LightRAG as a Docker service on srv1291263 to serve as the Babelfish knowledge layer.

This is infrastructure work, not Portal code. Create deployment configs in a new directory: infrastructure/lightrag/

Create:
1. infrastructure/lightrag/docker-compose.yml
   - LightRAG service (Python, exposed on port 9621)
   - Neo4j for graph storage (or use LightRAG's built-in storage)
   - Volume mounts for persistent graph data and document storage

2. infrastructure/lightrag/Dockerfile (if customization needed)
   - Base: python:3.11-slim
   - Install lightrag, sentence-transformers, or configure for Ollama embeddings
   - Expose API port

3. infrastructure/lightrag/.env.example
   - LIGHTRAG_PORT=9621
   - LIGHTRAG_EMBEDDING_MODEL=BAAI/bge-m3 (or ollama:bge-m3 when Ollama is available)
   - LIGHTRAG_LLM_MODEL=ollama:llama3.1 (or openrouter for initial deployment)
   - LIGHTRAG_STORAGE_DIR=/data/lightrag

4. infrastructure/lightrag/ingest.sh
   - Script to bulk-ingest the /docs directory into LightRAG
   - Watches for file changes and auto-reindexes

5. Update docs/deny-list.md
   - Add LightRAG API endpoint to D4 network allowlist

Create the babelfish_query tool definition (do NOT wire it into tools.ts yet — that happens after LightRAG is verified running):

6. infrastructure/lightrag/tool-spec.md
   - Tool name: babelfish_query
   - Parameters: query (string), mode ('naive'|'local'|'global'|'hybrid')
   - Returns: { results: string[], entities: string[], relationships: string[] }

Branch: feat/lightrag-infra

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 3A-1 to COMPLETE. Note: LightRAG API endpoint, graph storage location, number of documents ingested, query latency observed. Commit: docs: update build state after Phase 3A-1 (LightRAG Deployment)
```

---

### Phase 3A-2: Babelfish Tool Integration

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Phase 3A-1 (LightRAG) is COMPLETE and verified.

Wire the babelfish_query tool into the Dojo agent runtime.

Prerequisites: LightRAG deployed and verified on srv1291263 (from feat/lightrag-infra).

Read:
- src/lib/server/tools.ts (tool definitions and execution)
- src/lib/server/agents/registry.ts (agent configs)
- infrastructure/lightrag/tool-spec.md (tool specification)
- docs/deny-list.md (D4 network allowlist)

Add to tools.ts:

1. New tool definition: babelfish_query
   - name: 'babelfish_query'
   - description: 'Query the Babelfish knowledge graph for information about the RBOS platform, specs, architecture, and project knowledge.'
   - parameters:
     - query: string (required) — natural language question
     - mode: enum ['naive', 'local', 'global', 'hybrid'] (default: 'hybrid')
   - Returns: structured results from LightRAG API

2. executeTool handler for babelfish_query:
   - Makes HTTP request to LightRAG API on srv1291263
   - Parse response and return structured results
   - Enforce D4 allowlist (add LightRAG endpoint)

3. Add babelfish_query to all agents' tool lists in their config files

Also update docs/deny-list.md to add the LightRAG endpoint to the D4 allowlist.

Branch: feat/babelfish-tool

CHECKPOINT: Update DOJO-BUILD-STATE.md — set 3A-2 to COMPLETE. Note: "Babelfish knowledge layer is LIVE. All agents can now query the project knowledge graph via babelfish_query tool." Commit: docs: update build state after Phase 3A-2 (Babelfish Tool) — Knowledge Layer complete
```

---

## Part 5 — The Three Workflow Loops (Gemini's Valid Architecture)

Once Phases 2A-2C are complete, these loops emerge naturally:

### Loop 1: Research-to-Code (DOC → FLUX → IOIO)

1. Alex tells DOC: "Write a spec for the user onboarding flow"
2. DOC queries Babelfish for existing architecture context
3. DOC writes the spec, commits on `doc/onboarding-spec`, opens PR
4. SAM reviews the spec adversarially → feedback stored
5. Alex assigns FLUX to review architecture
6. FLUX reads the spec, provides architecture feedback
7. DOC revises, SAM re-reviews
8. Alex merges the spec
9. Alex tells IOIO: "Implement the onboarding spec at docs/specs/onboarding.md"
10. IOIO reads the spec, implements, opens PR
11. SAM reviews code against spec → feedback stored
12. QAE validates implementation matches spec → feedback stored
13. Alex merges

### Loop 2: Self-Improvement (SAM → All Agents)

1. Any agent opens a PR → SAM auto-reviews
2. SAM's structured feedback is stored in `agent_feedback`
3. Alex merges or rejects → merge/reject signal stored
4. Absorb loop runs (daily cron via n8n):
   - Processes unabsorbed feedback
   - Creates/updates agent memories
   - Promotes high-confidence patterns to skills
   - Decays stale memories
5. Next session, agent loads enhanced prompt with learned preferences + skills
6. Agent performs better → SAM approves more → confidence grows → skills mature

### Loop 3: DevOps Orchestration (Headless + QAE)

1. n8n triggers nightly headless task: "Run build verification"
2. Headless FLUX runs `npm run build`, reports results
3. If build fails: creates an issue or notifies Alex
4. n8n triggers weekly: "Audit dependencies for vulnerabilities"
5. Headless QAE scans package.json, reports outdated/vulnerable packages
6. Results stored in Agent Reports UI for Alex's review

---

## Part 6 — What We Deliberately Defer

| Gemini Concept | Why Deferred | When |
|----------------|--------------|------|
| OpenDevin integration | Dojo IS the agent execution env; OpenDevin is redundant | Never — conceptual overlap |
| Playwright MCP (SAM) | SAM's value is as pure critic; adding execution tools changes its role | Revisit Phase 4 if E2E testing needed |
| ZAP/OWASP MCP (QAE) | Security scanning belongs in CI (GitHub Actions), not in-agent | Phase 4 — CI integration |
| PaperClip orchestration | RedBeard router serves same purpose, purpose-built for Dojo | Phase 3+ as RedBeard |
| Hermes learning loop | Replaced by our custom absorb loop, tailored to Dojo's feedback model | Absorbed into Phase 2C |
| LangGraph critique node | SAM already does this; adding LangGraph adds unnecessary complexity | Never — SAM is sufficient |
| "Zero-human" autonomy | Violates RBOS's human-in-the-loop principle (Alex is sole merge authority) | Never — by design |

---

## Execution Order Summary (REVISED — Ollama Foundational)

```
PHASE 2A-0 (Infrastructure) — Deploy FIRST, runs parallel to Portal code
  0. Ollama on srv1291263 (feat/ollama-infra)       ← NEW: FOUNDATIONAL
     └── Models: Llama 3.1 8B Q4 (reasoning), BGE-M3 (embeddings)
     └── Reverse proxy, health check, systemd service
     └── Frees all routine inference from OpenRouter token cost

PHASE 2A (Foundation) — Portal code, in order
  1. Agent Registry (feat/agent-registry)           ← CRITICAL PATH BLOCKER
  2. Memory Schema (feat/agent-memory-schema)
  3. Memory Prompt Builder (feat/agent-memory-loader)
     └── Uses Ollama for memory extraction (not OpenRouter)
  4. Memory Tools (feat/agent-memory-tools)

PHASE 2B (Agent Swarm) — Parallel after Registry merges
  1. DOC agent (feat/agent-doc)
  2. IOIO agent (feat/agent-ioio)
  3. QAE agent (feat/agent-qae)
  4. UXUI agent (feat/agent-uxui)
  5. SAM feedback persistence (feat/sam-feedback)
  6. Alex merge/reject signals (feat/alex-signals)

PHASE 2C (Self-Improvement) — After 2B
  1. Absorb Loop (feat/agent-absorb-loop)
     └── Routes through Ollama (Llama 3.1 8B) for pattern extraction
  2. Memory Dashboard (feat/agent-memory-dashboard)

PHASE 3A (Knowledge) — Independent infrastructure track
  1. LightRAG deployment (feat/lightrag-infra)
     └── Uses Ollama BGE-M3 for embeddings (zero cost)
     └── Uses Ollama Llama 3.1 8B for entity extraction
  2. Babelfish tool integration (feat/babelfish-tool)

PHASE 3B (Headless) — After Agent Swarm
  1. Headless endpoint
  2. n8n integration
  3. Scheduled tasks (build verify, dep audit)
  4. Agent Reports UI
```

---

## Addendum: srv1291263 Hardware Constraints & Model Strategy

### VPS Specifications (Hostinger KVM 4)

| Resource | Spec | Constraint Impact |
|----------|------|------------------|
| CPU | 4 vCPU AMD EPYC | CPU-only inference, ~8-12 tok/s for 8B models |
| RAM | 16 GB DDR5 | Can run ONE 8B Q4 model (~5GB) + BGE-M3 (~1.2GB) + OS/services |
| Storage | 200 GB NVMe Gen4 | Plenty for models + LightRAG graph data |
| Bandwidth | 16 TB/month | More than sufficient for API traffic |
| GPU | None | No GPU acceleration — quantized models only |

### Model Selection for 16GB RAM / CPU-Only

**Available RAM budget:** 16GB total - 2GB OS - 2GB n8n - 1GB LightRAG = ~11GB for Ollama models

| Model | Purpose | Size (Q4) | RAM | Speed (CPU) | Priority |
|-------|---------|-----------|-----|-------------|----------|
| **Llama 3.1 8B Q4_K_M** | Reasoning: absorb loop, pattern extraction, SAM pre-checks | 4.9 GB | ~5.5 GB loaded | ~8-12 tok/s | Primary |
| **BGE-M3** | Embeddings for LightRAG + semantic search | 567M params | ~1.2 GB | Fast (embedding is cheaper than generation) | Primary |
| **Phi-3 Mini 3.8B Q4** | Lightweight classification, memory categorization | 2.3 GB | ~3 GB loaded | ~15-20 tok/s | Secondary (swap in when needed) |
| Gemma 2 9B | Alternative reasoning if Llama underperforms | 5.4 GB | ~6 GB loaded | ~7-10 tok/s | Backup |

**Concurrent model strategy:** Ollama keeps models loaded in RAM. With 11GB budget:
- Always loaded: BGE-M3 (1.2GB) — embeddings are called frequently
- Load on demand: Llama 3.1 8B (5.5GB) — for reasoning tasks
- Total when both loaded: ~6.7GB — well within budget
- Leaves ~4.3GB headroom for LightRAG graph operations and spikes

### What Routes Through Ollama vs. OpenRouter

| Task | Model | Where | Why |
|------|-------|-------|-----|
| FLUX architecture reasoning | Claude Sonnet 4 | OpenRouter | Complex multi-file code gen needs frontier model quality |
| FLUX/IOIO code writing | Claude Sonnet 4 | OpenRouter | Code quality is mission-critical, can't compromise |
| DOC spec drafting | Claude Sonnet 4 | OpenRouter | Spec quality matters, frontier model |
| SAM adversarial review | Claude Sonnet 4 | OpenRouter | Critic needs to be at least as smart as the coder |
| **Absorb loop (feedback → memory)** | Llama 3.1 8B | **Ollama** | Routine classification, doesn't need frontier quality |
| **Memory extraction patterns** | Llama 3.1 8B | **Ollama** | Pattern matching from structured SAM output |
| **SAM pre-check (fast sanity)** | Llama 3.1 8B | **Ollama** | Quick "does this PR even compile" check before full review |
| **LightRAG embeddings** | BGE-M3 | **Ollama** | All embedding generation at zero token cost |
| **LightRAG entity extraction** | Llama 3.1 8B | **Ollama** | Graph construction during document ingestion |
| **Memory categorization** | Phi-3 Mini | **Ollama** | Simple classification task, tiny model sufficient |
| **Skill instruction generation** | Llama 3.1 8B | **Ollama** | Converting patterns into skill text |

**Cost impact:** All bolded rows above would otherwise cost OpenRouter tokens. At ~$3/M input + $15/M output for Claude Sonnet, the absorb loop alone (running daily across all agents) could cost $50-100/month. Ollama makes it free.

### Performance Expectations (CPU-Only)

At ~8-12 tokens/second for Llama 3.1 8B on AMD EPYC:
- Absorb loop processing 20 feedback items: ~2-5 minutes (acceptable, runs async)
- SAM pre-check on a small PR: ~15-30 seconds (acceptable, not blocking)
- LightRAG document ingestion (10-page spec): ~5-10 minutes (acceptable, runs in background)
- BGE-M3 embedding generation: Fast — embedding models are much cheaper than generation

This is not fast enough for interactive chat (Alex would notice latency), which is why agent chat stays on OpenRouter. But for background processing, it's more than adequate.

### Claude Code Build Prompt: Phase 2A-0 — Ollama Infrastructure

```
FIRST: Read DOJO-BUILD-STATE.md to confirm this is the current phase. This is Phase 2A-0, the very first infrastructure task.

Deploy Ollama as a foundational inference service on srv1291263 (Hostinger KVM 4 VPS).

This is the local reasoning engine for the RBOS Dojo self-improvement system. It handles
all routine inference tasks (feedback absorption, memory extraction, embeddings, pre-checks)
so that expensive frontier model calls (OpenRouter/Claude Sonnet) are reserved for
mission-critical agent reasoning.

Context: srv1291263 is a CPU-only VPS (4 vCPU AMD EPYC, 16GB DDR5 RAM, 200GB NVMe).
No GPU. All inference runs on CPU with quantized models.

Create: infrastructure/ollama/

1. infrastructure/ollama/docker-compose.yml
   - Ollama service using ollama/ollama:latest image
   - Exposed on port 11434 (default)
   - Volume mount for model storage: /data/ollama:/root/.ollama
   - Restart: unless-stopped
   - Memory limit: 10GB (leave headroom for OS + other services)
   - CPU limit: 3 cores (leave 1 for OS + n8n)
   - Health check: curl http://localhost:11434/api/tags

2. infrastructure/ollama/setup.sh
   - Pulls required models after Ollama starts:
     ollama pull llama3.1:8b          # Primary reasoning (~4.9GB)
     ollama pull bge-m3               # Embeddings (~1.2GB)
     ollama pull phi3:mini            # Lightweight classification (~2.3GB)
   - Verifies each model loaded correctly
   - Runs a smoke test: echo '{"model":"llama3.1:8b","prompt":"Say hello","stream":false}' | curl -X POST http://localhost:11434/api/generate -d @-

3. infrastructure/ollama/nginx-proxy.conf
   - Reverse proxy on port 443 with SSL (Let's Encrypt)
   - Rate limiting: 60 requests/minute
   - IP allowlist: only Vercel deployment IPs + Alex's IP
   - Proxy pass to localhost:11434
   - Add to existing nginx config on srv1291263

4. infrastructure/ollama/ollama.service (systemd unit)
   - Ensure Ollama container starts on boot
   - Depends on docker.service
   - Restart on failure with 10s delay

5. infrastructure/ollama/.env.example
   OLLAMA_HOST=0.0.0.0
   OLLAMA_MODELS=/data/ollama
   OLLAMA_MAX_LOADED_MODELS=2        # BGE-M3 always + 1 reasoning model
   OLLAMA_NUM_PARALLEL=1             # CPU-only, no parallelism benefit
   OLLAMA_KEEP_ALIVE=15m             # Unload unused models after 15min

6. infrastructure/ollama/README.md
   - Quick-start instructions
   - Model inventory with RAM requirements
   - Performance expectations (tok/s on CPU)
   - API endpoint documentation
   - Troubleshooting (OOM, slow inference, model loading)

7. Update docs/deny-list.md
   - Add Ollama endpoint to D4 network allowlist:
     srv1291263 Ollama API (ollama.rbos.dev or IP:11434)

Branch: feat/ollama-infra

CHECKPOINT: Update DOJO-BUILD-STATE.md — set "2A-0: Ollama Infrastructure" to COMPLETE. Under Session Handoff Notes, record: Ollama API URL, models pulled, smoke test tok/s result, nginx proxy status, systemd service status. Commit: docs: update build state after Phase 2A-0 (Ollama Infrastructure)
```

### Claude Code Build Prompt: Ollama Client Module (Portal Side)

```
FIRST: Read DOJO-BUILD-STATE.md to confirm Ollama Infrastructure is deployed on srv1291263.

Create a server-side Ollama client module for the RBOS Portal that routes routine
inference tasks to the self-hosted Ollama instance on srv1291263.

Context: Ollama is deployed on srv1291263 as the local inference engine. The Portal
(on Vercel) calls Ollama's API for routine tasks (feedback processing, embeddings,
classification) while keeping agent chat on OpenRouter for quality.

Read:
- src/lib/server/agents/memory.ts (if it exists — this module will call Ollama)
- src/lib/server/flux-prompt.ts (to see how OpenRouter is called currently)

Create: src/lib/server/ollama.ts

Exports:

1. ollamaGenerate(prompt: string, options?: OllamaOptions): Promise<string>
   - Calls POST ${OLLAMA_BASE_URL}/api/generate
   - Default model: 'llama3.1:8b'
   - Options: model, temperature (default 0.3), max_tokens, system prompt
   - Returns the generated text
   - Handles timeouts gracefully (CPU inference is slow, set 120s timeout)
   - Falls back to OpenRouter if Ollama is unreachable (with warning log)

2. ollamaEmbed(texts: string[]): Promise<number[][]>
   - Calls POST ${OLLAMA_BASE_URL}/api/embed
   - Model: 'bge-m3'
   - Returns array of embedding vectors
   - Batch support: sends multiple texts in one request

3. ollamaClassify(text: string, categories: string[]): Promise<string>
   - Convenience wrapper around ollamaGenerate
   - Builds a classification prompt: "Classify the following into one of: {categories}. Text: {text}. Category:"
   - Uses phi3:mini model for speed
   - Returns the selected category

4. ollamaHealthCheck(): Promise<{ status: 'ok' | 'unreachable', models: string[] }>
   - Calls GET ${OLLAMA_BASE_URL}/api/tags
   - Returns loaded models and connection status

Environment variable: OLLAMA_BASE_URL (required, e.g., https://ollama.rbos.dev or http://srv-ip:11434)
Add to .env.example if it exists, or document in the module.

TypeScript interfaces:
- OllamaOptions { model?: string, temperature?: number, max_tokens?: number, system?: string }
- OllamaResponse (from the API spec)

Error handling:
- Network errors: log warning, fall back to OpenRouter
- Timeout (>120s): log warning, return error to caller
- Model not found: log error, suggest running setup.sh

Branch: feat/ollama-client

CHECKPOINT: Update DOJO-BUILD-STATE.md — set "2A-0: Ollama Client Module" to COMPLETE. Note whether fallback to OpenRouter was tested. Commit: docs: update build state after Phase 2A-0 (Ollama Client) — Ollama fully operational
```
