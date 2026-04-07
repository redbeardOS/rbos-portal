import { getContext, setContext } from 'svelte';

export interface Message {
	id: string;
	role: 'user' | 'agent';
	agent?: string;
	content: string;
	status: 'streaming' | 'complete' | 'error';
	timestamp: number;
	toolCalls?: ToolCall[];
	prUrl?: string;
	prNumber?: number;
	verdict?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

export interface ToolCall {
	tool: string;
	args?: Record<string, unknown>;
	result?: string;
	status: 'running' | 'done' | 'error';
}

export type AgentPhase = 'idle' | 'thinking' | 'coding' | 'committing' | 'reviewing' | 'error';

export class ChatState {
	messages = $state<Message[]>([]);
	agentPhase = $state<AgentPhase>('idle');
	isStreaming = $state(false);
	error = $state<string | null>(null);
	conversationId = $state<string | null>(null);

	setConversationId(id: string) {
		this.conversationId = id;
	}

	startNewConversation() {
		this.conversationId = null;
		this.messages = [];
		this.agentPhase = 'idle';
		this.isStreaming = false;
		this.error = null;
	}

	addUserMessage(content: string): Message {
		const msg: Message = {
			id: crypto.randomUUID(),
			role: 'user',
			content,
			status: 'complete',
			timestamp: Date.now()
		};
		this.messages.push(msg);
		return msg;
	}

	startAgentMessage(agent: string = 'FLUX'): Message {
		const msg: Message = {
			id: crypto.randomUUID(),
			role: 'agent',
			agent,
			content: '',
			status: 'streaming',
			timestamp: Date.now(),
			toolCalls: []
		};
		this.messages.push(msg);
		this.isStreaming = true;
		this.agentPhase = 'thinking';
		return msg;
	}

	startSamReview(): Message {
		const msg: Message = {
			id: crypto.randomUUID(),
			role: 'agent',
			agent: 'SAM',
			content: '',
			status: 'streaming',
			timestamp: Date.now()
		};
		this.messages.push(msg);
		this.agentPhase = 'reviewing';
		return msg;
	}

	appendToken(messageId: string, token: string) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.content += token;
		}
	}

	setPhase(phase: AgentPhase) {
		this.agentPhase = phase;
	}

	addToolCall(messageId: string, tool: string, args?: Record<string, unknown>) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.toolCalls = msg.toolCalls ?? [];
			msg.toolCalls.push({ tool, args, status: 'running' });
		}
	}

	setPrOpened(messageId: string, url: string, number: number) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.prUrl = url;
			msg.prNumber = number;
		}
	}

	setVerdict(messageId: string, verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.verdict = verdict;
		}
	}

	completeToolCall(messageId: string, tool: string, result: string) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg?.toolCalls) {
			const tc = msg.toolCalls.findLast((t) => t.tool === tool && t.status === 'running');
			if (tc) {
				tc.result = result;
				tc.status = 'done';
			}
		}
	}

	completeAgentMessage(messageId: string) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.status = 'complete';
		}
		this.isStreaming = false;
		this.agentPhase = 'idle';
	}

	setError(messageId: string | null, error: string) {
		if (messageId) {
			const msg = this.messages.find((m) => m.id === messageId);
			if (msg) {
				msg.status = 'error';
			}
		}
		this.error = error;
		this.isStreaming = false;
		this.agentPhase = 'error';
	}

	clearError() {
		this.error = null;
		if (this.agentPhase === 'error') {
			this.agentPhase = 'idle';
		}
	}

	loadFromHistory(
		dbMessages: Array<{
			id: string;
			role: string;
			content: string | null;
			tool_calls: unknown[] | null;
			agent: string | null;
			created_at: string;
		}>
	) {
		const mapMsg = (m: (typeof dbMessages)[0]) => ({
			id: m.id,
			role: m.role === 'user' ? ('user' as const) : ('agent' as const),
			agent: m.agent ?? undefined,
			content: m.content ?? '',
			status: 'complete' as const,
			timestamp: new Date(m.created_at).getTime()
		});

		// If currently streaming, merge instead of replace
		if (this.isStreaming) {
			const existingIds = new Set(this.messages.map((m) => m.id));
			const newMsgs = dbMessages
				.filter((m) => !existingIds.has(m.id))
				.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
				.map(mapMsg);
			const streamingIdx = this.messages.findIndex((m) => m.status === 'streaming');
			if (streamingIdx >= 0) {
				this.messages.splice(streamingIdx, 0, ...newMsgs);
			} else {
				this.messages.push(...newMsgs);
			}
			return;
		}

		// Not streaming — full replace
		this.messages = dbMessages
			.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content))
			.map(mapMsg);
		this.isStreaming = false;
		this.agentPhase = 'idle';
		this.error = null;
	}
}

const CHAT_CTX = Symbol('chat');

export function setChatState(state: ChatState) {
	setContext(CHAT_CTX, state);
}

export function getChatState(): ChatState {
	return getContext<ChatState>(CHAT_CTX);
}
