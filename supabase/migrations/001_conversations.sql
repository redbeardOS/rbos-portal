-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text, -- auto-generated from first message, nullable
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text, -- nullable for assistant messages with only tool_calls
  tool_calls jsonb, -- stored as JSON array for assistant messages
  tool_call_id text, -- for tool result messages
  agent text, -- 'FLUX', 'SAM', etc. — null for user/system/tool messages
  created_at timestamptz not null default now()
);

-- Index for fetching conversation history
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at asc);

-- Auto-update updated_at on conversations
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger conversations_updated_at
  before update on public.conversations
  for each row execute function update_updated_at();
