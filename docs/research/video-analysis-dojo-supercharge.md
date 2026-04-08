# Supercharging the Dojo Dev Agents — Video Research Analysis

**Date:** 2026-04-07
**Author:** Claude (research synthesis for Alex)
**Scope:** Analysis of 6 YouTube videos on agentic patterns, RAG systems, and multi-agent orchestration, mapped against the current RBOS Dojo architecture and Phase 2 roadmap.

---

## Videos Analyzed

| # | Title | Creator | Duration | Core Topic |
|---|-------|---------|----------|------------|
| 1 | Every Claude Code Workflow Explained (& When to Use Each) | Simon Scrapes | 17:49 | 5 agentic design patterns |
| 2 | Claude Code + LightRAG = UNSTOPPABLE | Chase AI | 20:25 | Graph RAG with LightRAG |
| 3 | Every Claude Code Concept Explained | Sabrina Ramonov | 1:29:50 | 30 Claude Code concepts for builders |
| 4 | Claude Code Ultra Plan Is INSANE! | Julian Goldie SEO | 8:03 | Cloud-based planning with multi-agent critique |
| 5 | Claude Code + RAG-Anything = LIMITLESS | Chase AI | 19:20 | Multi-modal RAG (PDFs, images, charts) |
| 6 | PaperClip + Hermes Agent + Gemma4 | Devs Kingdom | 11:56 | Open-source swarm orchestration |

---

## Current Dojo State (Sprint 1)

Before mapping the video insights, here's where the Dojo stands today:

- **Single agent** — FLUX (Staff Architect) is the only user-facing agent
- **SAM** — Critic, auto-triggered after FLUX opens a PR (not user-selectable)
- **Sequential flow only** — one conversation, one agent, linear context growth
- **No persistent memory** — in-memory conversation storage, lost on restart
- **No RAG** — agents have no access to external knowledge beyond the repo
- **No headless/scheduled execution** — everything is human-initiated
- **Phase 2 agents planned** — DOC, IOIO, QAE, UXUI, plus Agent Registry and RedBeard router
- **Babelfish** — mentioned in architecture as a future knowledge layer, not yet built

---

## Video-by-Video Analysis & Dojo Application

### Video 1 — Five Agentic Design Patterns (Simon Scrapes)

**Key concepts:** The video identifies five progressively sophisticated patterns for Claude Code usage. Each maps to a phase of the Dojo's evolution.

**Pattern 1 — Sequential:** What the Dojo does today. FLUX operates in a single conversation thread with growing context. The video warns about "context rot" — as conversations lengthen, the agent loses track of earlier context. The mitigation strategies discussed (CLAUDE.md files, skills, /clear, /compact) are relevant to how FLUX's system prompt and conversation management should evolve.

**Pattern 2 — Operator:** The human orchestrates multiple parallel agent sessions. This maps directly to the Phase 2 Agent Registry — Alex selects DOC, FLUX, or IOIO from the dropdown and runs them in parallel browser tabs or separate conversations. The video emphasizes that the human acts as the routing intelligence, deciding which agent gets which task. This is the immediate next step before RedBeard automates routing.

**Pattern 3 — Split & Merge:** A task gets decomposed into sub-tasks, each handled by a different agent or sub-agent, then results are merged. This is precisely what RedBeard should do. Example workflow: Alex says "build the persistent conversations feature." RedBeard splits it into: DOC drafts the schema spec, FLUX reviews architecture, IOIO implements, QAE validates. Results merge into a single PR or feature branch.

**Pattern 4 — Teams:** A primary agent delegates to specialist sub-agents that run in their own context windows. The video describes how Claude Code's built-in sub-agents (Explore, Plan, General Purpose) each run in isolated context. This pattern suggests FLUX should be able to spawn sub-tasks to DOC or IOIO without requiring Alex to manually switch agents. The primary agent maintains the high-level plan while sub-agents do focused work.

**Pattern 5 — Headless:** Fire-and-forget, cron-scheduled agent execution with no human in the loop. The agent runs on a schedule, produces output (reports, PRs, audits), and the human reviews results later. This pattern opens up entirely new Dojo capabilities: nightly dependency audits, automated code quality reports, scheduled test runs, and proactive tech debt identification.

**Dojo Impact:** The Dojo roadmap already plans for patterns 1-4 (Sequential → Agent Registry → RedBeard routing → multi-agent teams). Pattern 5 (Headless) is not on the roadmap at all and represents the biggest net-new capability opportunity.

---

### Video 2 — LightRAG + Claude Code (Chase AI)

**Key concepts:** The video builds a graph RAG system using LightRAG, an open-source alternative to Microsoft's GraphRAG. It explains the evolution from naive RAG (simple vector similarity) through hybrid search (combining vector + keyword) to graph RAG (entities, relationships, and community summaries stored as a knowledge graph).

**Why naive RAG fails:** Simple vector search only finds chunks that are semantically similar to the query. It misses relationships between concepts — it can tell you about warships, but it can't tell you how warships relate to naval strategy documents, procurement specs, and maintenance schedules. For the Dojo, this matters because RBOS project knowledge is deeply relational: specs reference components, components reference other components, client requirements reference product lines.

**Graph RAG advantage:** LightRAG creates a knowledge graph where entities (components, specs, agents, features) are nodes and their relationships are edges. When queried, it can traverse relationships to find contextually relevant information even when the query terms don't appear in the source documents. It supports three query modes: naive (vector only), local (entity-focused), global (community summaries), and hybrid (all combined).

**Claude Code integration:** The video shows connecting Claude Code to LightRAG via a custom skill that makes API calls to the LightRAG server. The skill lets the agent query the knowledge graph, ingest new documents, and use retrieved context to inform its work.

**Dojo Impact:** This is the Babelfish knowledge layer. LightRAG running as a service (on srv1291263 or a container) would give every Hive agent access to the full corpus of RBOS project knowledge — architecture docs, specs, client requirements, product catalogs, meeting notes. The graph structure means DOC can find all specs related to a feature area, FLUX can understand how components interconnect, and QAE can trace requirements to implementations.

---

### Video 3 — Every Claude Code Concept (Sabrina Ramonov)

**Key concepts:** A comprehensive walkthrough of 30 Claude Code concepts including tool use, CLAUDE.md as the project instruction manual, skills as reusable prompt templates, commands, context management, and the distinction between Claude acting vs. chatting.

**Most relevant to Dojo:** The video emphasizes that CLAUDE.md is the single most important file for shaping agent behavior — it's loaded at the start of every session and acts as persistent memory across conversations. For the Dojo, this maps to the system prompts for each agent (flux-system-prompt.md, the planned DOC/IOIO/QAE/UXUI prompts). The video also discusses skills as composable, reusable instruction sets that agents can load on demand.

**Context management:** The video covers /clear and /compact as tools for managing context window limits. For the Dojo's API layer, this suggests implementing server-side conversation compaction — when context grows past a threshold, automatically summarize earlier messages while preserving key decisions and code references.

**Dojo Impact:** The Dojo's system prompts are already well-structured, but the skills concept could be formalized. Instead of monolithic system prompts, each agent could have a base prompt plus loadable skills (e.g., FLUX loads "svelte-5-patterns" skill when working on components, "supabase-migration" skill when working on database features). This keeps the base context lean while providing deep expertise on demand.

---

### Video 4 — Claude Code UltraPlan (Julian Goldie SEO)

**Key concepts:** UltraPlan offloads planning to the cloud, generating detailed task plans with three variant types: simple (step-by-step), visual (diagrams and architecture), and deep multi-agent (multiple agents critique each other's analysis, identifying risks and edge cases). The key insight is that planning happens before any code is written, in a reviewable web UI.

**Plan-then-execute pattern:** The video describes a workflow where the agent generates a comprehensive plan (with dependency mapping, risk identification, and edge case analysis), the human reviews and comments on it, and only then does execution begin. The multi-agent variant is particularly relevant — it spins up multiple analysis agents that critique each other.

**Dojo Impact:** This maps directly to how DOC and SAM should interact. Today SAM only reviews after FLUX writes code. The UltraPlan pattern suggests a pre-implementation review loop: DOC writes the spec → FLUX reviews architecture → SAM critiques adversarially → DOC revises → only then does IOIO implement. The "multiple agents critique each other" concept is exactly the Standards First methodology already described in the FLUX system prompt, but the video shows how to make it more structured with explicit plan artifacts that get human review before implementation begins.

The visual plan variant (generating mermaid diagrams of architecture) is directly useful — DOC could generate architecture diagrams as part of every spec, making the plan reviewable as both text and visuals.

---

### Video 5 — RAG-Anything + LightRAG (Chase AI)

**Key concepts:** RAG-Anything extends LightRAG to handle non-text documents — scanned PDFs, images, charts, graphs, CAD files. It uses MinerU for document parsing (converting scanned PDFs to structured text), vision models for image/chart understanding, and then feeds everything into the same LightRAG knowledge graph.

**The multi-modal problem:** Most RAG systems can only handle text. But real-world enterprise data is full of scanned PDFs, spec sheets with diagrams, product images, architectural drawings, and charts. RAG-Anything creates a pipeline: document → MinerU parsing → text extraction + image captioning → chunking → knowledge graph ingestion.

**Merged knowledge graph:** RAG-Anything creates its own intermediate knowledge graph for non-text content, then merges it with the main LightRAG graph. This means queries against the unified graph return results from both text documents and parsed non-text sources.

**Dojo Impact:** This is critical for the Partner Asset Pipeline and the broader RBOS platform. RBOS deals heavily in manufacturer spec sheets (PDFs with tables, diagrams, and images), CAD files, product catalogs, and proposal documents. A RAG-Anything layer would let the Hive agents access this content intelligently. FLUX could query the knowledge graph for manufacturer specs when building integration features. DOC could reference product documentation when writing specs. The already-planned RAG Partner Asset Pipeline skill (rag-partner-asset-deploy) aligns directly with this — it scrapes manufacturer sites for proposal images, PDF specs, and CAD files. RAG-Anything would be the ingestion and retrieval layer for that pipeline.

---

### Video 6 — PaperClip + Hermes Agent + Gemma4 (Devs Kingdom)

**Key concepts:** PaperClip is an open-source orchestration layer for multi-agent systems — the video describes it as "if OpenClaw is an employee, PaperClip is the company." Hermes Agent is a self-improving agent from Nous Research with a built-in learning loop: it creates skills from experience, improves them during use, persists knowledge across sessions, and searches its own past conversations.

**Self-improving agents:** Hermes maintains a "deepening model" of the user and the project. It learns from interactions, creates reusable skills automatically, and builds on past experience. This is agent memory that goes beyond simple conversation persistence — it's skill acquisition.

**Parallel sub-agent delegation:** The video shows Hermes spinning up multiple parallel sub-agents for different tasks (research, comparison, summarization) and merging their results. This is the Teams pattern from Video 1, but with an orchestration layer (PaperClip) managing the agent lifecycle.

**Security layers:** Hermes has configurable approval modes — manual (human approves every action), smart (LLM decides what needs approval), and off (bypass all checks). This is directly analogous to the Dojo's deny-list system, but with a more nuanced middle tier.

**Dojo Impact:** Two major takeaways. First, the self-improving agent concept could be layered onto the Hive agents. Instead of static system prompts, agents could accumulate learned patterns — FLUX learns which architectural patterns Alex prefers, DOC learns the spec format that gets approved fastest, QAE learns which edge cases matter most. This could be implemented as an agent-specific memory store (separate from Babelfish) that each agent reads/writes between sessions. Second, the security tier concept (manual/smart/off) could evolve the Dojo's binary deny-list into a more nuanced permission system where low-risk operations auto-approve, medium-risk operations get LLM review, and high-risk operations require human approval.

---

## Synthesis: Prioritized Recommendations

### Tier 1 — High Impact, Builds on Current Roadmap

**1. Formalize the Plan-Review-Execute Loop (from Videos 1, 4)**

Before RedBeard exists, implement a structured planning phase in the Dojo. When a task arrives, FLUX (or eventually RedBeard) generates a plan artifact — a structured markdown document with: task decomposition, affected files, architectural decisions, risk flags, and mermaid diagrams. This plan gets streamed to the chat surface for Alex's review before any code is written. SAM can adversarially review the plan, not just the final code.

Implementation: Add a `plan` tool to FLUX's toolset that creates a structured plan document. Add a `plan_review` SSE event type. The chat surface renders plan artifacts with approve/reject/comment controls. FLUX only proceeds to implementation after plan approval.

**2. Agent Memory / Learning Store (from Video 6)**

Give each agent a persistent memory file that survives across sessions. Not conversation history (that's Supabase in Sprint 2), but learned preferences and patterns. Examples: FLUX remembers that Alex prefers extracting Svelte components at 3+ repetitions, DOC remembers that specs need a "Migration Plan" section, QAE remembers which test patterns caught real bugs.

Implementation: Each agent gets a `memory.json` in its config directory. The agent reads it at session start and can write to it via a new `update_memory` tool. Memory entries are key-value pairs with timestamps. Alex can review/edit memory files directly.

**3. Headless Agent Execution (from Video 1)**

Add a cron/scheduled execution mode to the Dojo. Agents run on a schedule without human initiation, produce output (PRs, reports, audit logs), and Alex reviews results asynchronously. Start with three headless tasks: nightly build verification, weekly dependency audit, and daily code quality scan.

Implementation: A new `/api/headless` endpoint that accepts a task definition and agent config. A simple cron runner (n8n on srv1291263 or Vercel Cron) triggers tasks on schedule. Output goes to a new "Agent Reports" section in the Dojo UI. Reuses the existing agentic loop but without SSE streaming — results are stored in Supabase.

### Tier 2 — High Impact, Requires New Infrastructure

**4. Babelfish as LightRAG (from Videos 2, 5)**

Build the Babelfish knowledge layer on LightRAG + RAG-Anything. Deploy LightRAG as a service (Docker container on srv1291263). Ingest all RBOS documentation: architecture docs, specs, handoff documents, CONTRIBUTING.md, meeting notes. Add RAG-Anything for manufacturer spec sheets and PDF documentation. Expose a query API that all Hive agents can call via a new `query_knowledge` tool.

Implementation: Docker Compose service for LightRAG with API endpoint. A `babelfish_query` tool added to all agents' tool definitions. An ingestion pipeline that watches the `/docs` directory and auto-indexes new/changed files. RAG-Anything adds support for the manufacturer PDFs and spec sheets the Partner Asset Pipeline produces.

**5. Smart Permission Tiers (from Video 6)**

Evolve the binary deny-list into a three-tier permission system. Tier 1 (auto-approve): file reads, directory listing, running tests — no human needed. Tier 2 (agent-review): file writes, commits, branch creation — an LLM quick-check verifies the operation makes sense in context. Tier 3 (human-approve): PR creation, dependency changes, config modifications — requires explicit Alex approval. This reduces friction for low-risk operations while maintaining the safety boundary for high-risk ones.

Implementation: Extend the deny-list filter with a tier classification. Tier 2 adds a lightweight Claude Haiku call that reviews the operation against the current task context and auto-approves or escalates. Tier 3 pauses execution and sends a notification via the chat surface.

### Tier 3 — Future Vision, Phase 2+

**6. Split & Merge Task Decomposition (from Videos 1, 6)**

When RedBeard is built, implement the split-and-merge pattern. RedBeard receives a high-level task, decomposes it into sub-tasks with dependency ordering, assigns each to the appropriate specialist agent, and merges results. This is the full Hive vision: Alex says "build feature X" and RedBeard orchestrates DOC → FLUX review → IOIO implementation → QAE validation → PR.

**7. Agent Skills System (from Videos 3, 6)**

Extend agent system prompts with loadable skills — focused instruction sets that agents activate on demand. FLUX gets "svelte-5-patterns," "supabase-migration," "tailwind-theming" skills. DOC gets "schema-spec," "api-contract," "migration-plan" skills. Skills are markdown files in the agent's directory, loaded into context when the agent determines they're relevant.

**8. Cross-Agent Knowledge Sharing (from Videos 2, 6)**

Beyond Babelfish (project knowledge), add a shared agent workspace where agents can leave artifacts for each other. DOC writes a spec to the workspace; FLUX reads it. FLUX leaves architecture notes; IOIO reads them. QAE writes a validation report; Alex reads it. This is not conversation history — it's structured artifacts with semantic meaning.

---

## Implementation Priority Map

```
Sprint 2 (Current Roadmap + Enhancements)
├── Agent Registry (already planned)
├── Persistent Conversations (already planned, Supabase)
├── [NEW] Plan-Review-Execute Loop (#1)
├── [NEW] Agent Memory Store (#2)
└── [NEW] Agent Skills System (#7, lightweight version)

Sprint 3 (New Capabilities)
├── [NEW] Headless Agent Execution (#3)
├── [NEW] Babelfish/LightRAG Knowledge Layer (#4)
└── [NEW] Smart Permission Tiers (#5)

Phase 2+ (Full Hive Vision)
├── RedBeard Router with Split & Merge (#6)
├── RAG-Anything for multi-modal content (#4 extension)
└── Cross-Agent Knowledge Sharing (#8)
```

---

## Key Takeaway

The videos collectively point to one core insight: **the Dojo's current sequential, single-agent, no-memory architecture is table stakes.** Every serious agentic system in 2026 is moving toward persistent memory, parallel execution, knowledge graph integration, and self-improving agent loops. The good news is that the Phase 2 roadmap already targets most of these — the Agent Registry, persistent conversations, and multi-agent awareness get the Dojo 60% of the way there. The three net-new capabilities that would most dramatically accelerate the Dojo are the plan-review-execute loop (cheap to build, immediate quality improvement), agent memory (relatively simple persistent key-value store, compounds over time), and Babelfish-as-LightRAG (significant infrastructure but unlocks the entire knowledge layer the architecture already envisions).
