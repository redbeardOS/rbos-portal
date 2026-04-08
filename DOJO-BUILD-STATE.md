# Dojo Self-Improving Agents — Build State Tracker

**Purpose:** This file is the single source of truth for where the Dojo build stands. If Claude Code starts a new session, it reads this file FIRST to know what's done, what's in progress, and what's next.

**Last updated:** 2026-04-08
**Updated by:** Claude Code (audit of inbox + repo state)

---

## Current Phase: PHASE 2 COMPLETE — Phase 3 next (Ollama/LightRAG/Headless)

## Quick Status

| Phase | Status | Branch | PR | Notes |
|-------|--------|--------|----|-------|
| 2A-0: Ollama Infrastructure | DEFERRED | — | — | Not a functional blocker; memory system uses OpenRouter initially |
| 2A-0: Ollama Client Module | DEFERRED | — | — | Will revisit after self-improvement loop is working |
| 2A-1: Agent Registry | COMPLETE | feat/agent-registry | #31 | Merged 2026-04-07. 6 agents registered (FLUX, SAM, DOC, IOIO, QAE, UXUI) |
| 2A-2: Memory Schema | COMPLETE | — | — | Applied 2026-04-08: agent_memory, agent_feedback, agent_skills tables |
| 2A-3: Memory Prompt Builder | COMPLETE | — | — | memory.ts: buildAgentPrompt loads memories + skills into prompts |
| 2A-4: Memory Tools | COMPLETE | — | — | read_memory + write_memory tools in tools.ts, added to all agents |
| 2B-1: DOC Agent | COMPLETE | fix/add-agent-team | #33 | Merged 2026-04-07 |
| 2B-2: IOIO Agent | COMPLETE | fix/add-agent-team | #33 | Merged 2026-04-07 (bundled with DOC, QAE, UXUI) |
| 2B-3: QAE Agent | COMPLETE | fix/add-agent-team | #33 | Merged 2026-04-07 |
| 2B-4: UXUI Agent | COMPLETE | fix/add-agent-team | #33 | Merged 2026-04-07 |
| 2B-5: SAM Feedback Persistence | COMPLETE | — | — | sam.ts persistSamFeedback() wired into chat endpoint |
| 2B-6: Alex Merge/Reject Signals | COMPLETE | — | — | POST /api/webhook — GitHub webhook for PR merge/reject |
| 2C-1: Absorb Loop | COMPLETE | — | — | absorb.ts + POST /api/absorb endpoint |
| 2C-2: Memory Dashboard | COMPLETE | — | — | /dojo/memory — agent tabs, memories, feedback, skills |
| 3A-1: LightRAG Deployment | NOT STARTED | — | — | Docker on srv1291263 |
| 3A-2: Babelfish Tool | NOT STARTED | — | — | Depends on 3A-1 |
| 3B-1: Headless Endpoint | NOT STARTED | — | — | Depends on agent registry (done) |
| 3B-2: n8n Integration | NOT STARTED | — | — | Depends on 3B-1 |

## Known Issues / Blockers

- Deny-list enforcement is partial: only D2 (filesystem) and D3 (secrets) are code-enforced in tools.ts. D1, D4, D5, D6, D7 are documented but not enforced.
- GitHub webhook needs to be configured in repo settings (URL: /api/webhook, secret: GITHUB_WEBHOOK_SECRET)
- Some stale agent branches exist from testing (doc/*, flux/*) — can be cleaned up.
- All Phase 2 changes are on feat/agent-memory-system branch (PR #35) — needs merge.

## Architecture Decisions Made

1. Ollama is deferred, not foundational — memory system works with OpenRouter initially
2. Agent chat stays on OpenRouter/Claude Sonnet; Ollama handles background tasks only (when deployed)
3. Self-improvement loop: SAM feedback → agent_feedback table → absorb loop → agent_memory → loaded into prompts
4. Memory confidence scoring: 0.0-1.0, patterns above 0.7 auto-promote to skills
5. All agents share the same deny-list (D1-D7)
6. Human-in-the-loop: Alex remains sole merge authority, always
7. Agent swarm was built before memory schema (out of order from original plan, but agents work fine with static prompts)

## VPS Specs (srv1291263)

- Hostinger KVM 4: 4 vCPU AMD EPYC, 16GB DDR5, 200GB NVMe, no GPU
- RAM budget for Ollama (when deployed): ~11GB (after OS + n8n + LightRAG)
- Models planned: Llama 3.1 8B Q4 (~5.5GB), BGE-M3 (~1.2GB), Phi-3 Mini (~3GB)

## Key Files

- Build plan: `docs/research/dojo-self-improving-agents-build-plan.md` (to be added from inbox)
- Architecture: `docs/architecture.md`
- Deny-list: `docs/deny-list.md`
- Agent registry: `src/lib/server/agents/registry.ts`
- Agent configs: `src/lib/server/agents/{flux,sam,doc,ioio,qae,uxui}.ts`
- Tool execution: `src/lib/server/tools.ts`
- SAM critic: `src/lib/server/sam.ts`
- Chat endpoint: `src/routes/api/chat/+server.ts`
- Conversations schema: `supabase/migrations/001_conversations.sql`

---

## Execution Order (Revised 2026-04-08)

```
PHASE 2A (Foundation) — Memory system, using OpenRouter
  2A-2: Memory Schema (agent_memory, agent_feedback, agent_skills tables)
  2A-3: Memory Prompt Builder (buildAgentPrompt, recordFeedback)
  2A-4: Memory Tools (read_memory, write_memory added to agents)

PHASE 2B (Remaining) — Wire feedback into memory
  2B-5: SAM Feedback Persistence (sam.ts → agent_feedback table)
  2B-6: Alex Merge/Reject Signals (webhook or poll for PR merge/reject)

PHASE 2C (Self-Improvement Loop)
  2C-1: Absorb Loop (feedback → patterns → memory → skills)
  2C-2: Memory Dashboard (Alex inspects/edits agent memories)

PHASE 3 (Infrastructure + Knowledge) — After self-improvement works
  3A-0: Ollama on srv1291263 (cost optimization)
  3A-1: LightRAG deployment
  3A-2: Babelfish tool integration
  3B: Headless execution + n8n
```

---

## Session Handoff Notes

### 2026-04-08 — Audit Session (Claude Code)

**Context:** Full audit of /root/inbox/ (13 files + 5 handoff folders) against repo state.

**Findings:**
- Original DOJO-BUILD-STATE.md (in inbox) was never committed and showed everything as NOT STARTED
- Repo had already completed: Agent Registry (#31), all 4 team agents (#33), agent-name-in-chat fix (#34)
- Inbox contained stale copies of sam.ts and tools.ts (pre-registry versions)
- All handoff specs (p2-agent-*) were correctly executed — code matches specs

**Decisions:**
- Ollama deferred — not a functional blocker for memory system
- Memory schema is the critical next step (Phase 2A-2)
- Stale inbox files archived, planning docs to be committed to repo

**Next session should:**
1. Read this file first
2. Commit + push the 2026-04-08 changes (memory system, absorb loop, SAM persistence)
3. Build 2B-6 (Alex merge/reject signals) — webhook on GitHub PR merge
4. Build 2C-2 (Memory Dashboard) — /dojo/memory route
5. Consider Ollama deployment for cost savings on absorb loop

### 2026-04-08 — Build Session (Claude Code)

**Built in this session:**
- `supabase/migrations/002_agent_memory.sql` — 3 tables (agent_memory, agent_feedback, agent_skills) applied to live Supabase
- `src/lib/server/agents/memory.ts` — buildAgentPrompt, recordFeedback, upsertMemory, readMemories
- `src/lib/server/agents/absorb.ts` — absorbFeedback, promoteSkills, decayMemories, runAbsorbCycle
- `src/routes/api/absorb/+server.ts` — POST endpoint for absorb loop
- Updated `tools.ts` — added read_memory + write_memory tool definitions + execution handlers
- Updated all 5 agent configs (flux, doc, ioio, qae, uxui) — added read_memory + write_memory to tool lists
- Updated `sam.ts` — added persistSamFeedback() that records structured feedback
- Updated `+server.ts` (chat) — memory-enhanced prompts via buildAgentPrompt(), SAM feedback persistence
- `DOJO-BUILD-STATE.md` — created and updated
- `docs/research/` — copied build plan + video analysis from inbox
- Build verified: `npm run build` passes cleanly

**Architecture note:** Memory system uses OpenRouter (no Ollama yet). The absorb loop is callable manually via `POST /api/absorb` or can be wired to n8n cron later.
