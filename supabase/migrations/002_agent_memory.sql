-- Agent Memory System — Self-Improving Agents
-- Three tables: persistent memory, feedback tracking, skill acquisition

-- Per-agent persistent memory (learned preferences, patterns, warnings)
create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,                    -- 'flux', 'doc', 'ioio', etc.
  category text not null check (category in ('preference', 'pattern', 'warning', 'skill')),
  key text not null,                         -- semantic key (e.g., 'component-extraction-threshold')
  value jsonb not null,                      -- structured memory content
  confidence real not null default 0.5       -- 0.0-1.0, increases with reinforcement
    check (confidence >= 0.0 and confidence <= 1.0),
  source text,                               -- what created this: 'PR #12', 'SAM review', 'Alex comment'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_id, key)
);

-- Feedback from SAM and Alex that feeds the improvement loop
create table if not exists public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,                    -- agent that received feedback
  source_agent text not null,                -- 'sam', 'alex'
  pr_number integer,                         -- associated PR (nullable for non-PR feedback)
  feedback_type text not null check (feedback_type in ('approve', 'request_changes', 'pattern', 'anti_pattern')),
  content text not null,                     -- the actual feedback
  applied boolean not null default false,    -- whether absorbed into memory
  created_at timestamptz not null default now()
);

-- Successful patterns promoted to reusable skills
create table if not exists public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  skill_name text not null,
  description text not null,
  instruction_text text not null,            -- actual skill content loaded into agent context
  trigger_pattern text,                      -- when to auto-load this skill
  usage_count integer not null default 0,
  success_rate real not null default 0.0     -- tracks how often this skill leads to APPROVE
    check (success_rate >= 0.0 and success_rate <= 1.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_id, skill_name)
);

-- Indexes
create index if not exists idx_memory_agent on public.agent_memory(agent_id);
create index if not exists idx_memory_agent_category on public.agent_memory(agent_id, category);
create index if not exists idx_feedback_agent on public.agent_feedback(agent_id, applied);
create index if not exists idx_feedback_pr on public.agent_feedback(pr_number);
create index if not exists idx_skills_agent on public.agent_skills(agent_id);

-- Reuse the updated_at trigger from 001
create or replace trigger agent_memory_updated_at
  before update on public.agent_memory
  for each row execute function update_updated_at();

create or replace trigger agent_skills_updated_at
  before update on public.agent_skills
  for each row execute function update_updated_at();
