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
}

export interface ToolCall {
	tool: string;
	args?: Record<string, unknown>;
	result?: string;
	status: 'running' | 'done' | 'error';
}

export type AgentPhase = 'idle' | 'thinking' | 'coding' | 'committing' | 'error';

export class ChatState {
	messages = $state<Message[]>([]);
	agentPhase = $state<AgentPhase>('idle');
	isStreaming = $state(false);
	error = $state<string | null>(null);

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

	setPrOpened(messageId: string, url: string, number: number) {
		const msg = this.messages.find((m) => m.id === messageId);
		if (msg) {
			msg.prUrl = url;
			msg.prNumber = number;
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
}

const CHAT_CTX = Symbol('chat');

export function setChatState(state: ChatState) {
	setContext(CHAT_CTX, state);
}

export function getChatState(): ChatState {
	return getContext<ChatState>(CHAT_CTX);
}
