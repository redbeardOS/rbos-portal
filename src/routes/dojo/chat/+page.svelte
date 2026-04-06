<script lang="ts">
	import { ChatState, setChatState } from '$lib/stores/chat.svelte';
	import MessageList from '$lib/components/MessageList.svelte';
	import InputBar from '$lib/components/InputBar.svelte';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import { createSupabaseBrowser } from '$lib/supabase';
	import { goto } from '$app/navigation';

	const chat = new ChatState();
	setChatState(chat);

	const supabase = createSupabaseBrowser();

	async function logout() {
		await supabase.auth.signOut();
		goto('/dojo');
	}

	async function handleSend(message: string) {
		chat.clearError();
		chat.addUserMessage(message);
		const agentMsg = chat.startAgentMessage('FLUX');

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
						message,
						...(chat.conversationId ? { conversationId: chat.conversationId } : {})
					})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				chat.setError(agentMsg.id, err.error ?? 'Request failed');
				return;
			}

			const reader = res.body?.getReader();
			if (!reader) {
				chat.setError(agentMsg.id, 'No response stream');
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				let currentEvent = '';
				for (const line of lines) {
					if (line.startsWith('event: ')) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith('data: ')) {
						const data = line.slice(6).trim();
						try {
							const parsed = JSON.parse(data);
							switch (currentEvent) {
								case 'conversation':
									chat.setConversationId(parsed.id);
									break;
								case 'token':
									chat.appendToken(agentMsg.id, parsed.content);
									break;
								case 'status':
									chat.setPhase(parsed.phase);
									break;
								case 'tool_call':
									chat.addToolCall(agentMsg.id, parsed.tool, parsed.args);
									break;
								case 'tool_result':
									chat.completeToolCall(agentMsg.id, parsed.tool, parsed.result);
									break;
								case 'pr_opened':
									chat.setPrOpened(agentMsg.id, parsed.url, parsed.number);
									break;
								case 'error':
									chat.setError(agentMsg.id, parsed.message);
									return;
								case 'done':
									chat.completeAgentMessage(agentMsg.id);
									break;
							}
						} catch {
							// Skip malformed events
						}
						currentEvent = '';
					}
				}
			}

			// If stream ended without a done event, complete anyway
			if (chat.isStreaming) {
				chat.completeAgentMessage(agentMsg.id);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Connection failed';
			chat.setError(agentMsg.id, msg);
		}
	}
</script>

<svelte:head>
	<title>Dojo — RBOS Portal</title>
</svelte:head>

<div class="flex flex-col h-screen bg-neutral-950 text-neutral-100">
	<header class="shrink-0 border-b border-neutral-800 px-4 py-3 flex items-center justify-between bg-neutral-950/90 backdrop-blur-sm">
		<div class="flex items-center gap-3">
			<a href="/" class="text-neutral-500 hover:text-neutral-300 text-sm transition-colors">
				Portal
			</a>
			<span class="text-neutral-700">/</span>
			<h1 class="text-sm font-medium">Dojo</h1>
		</div>
		<div class="flex items-center gap-3">
			<button onclick={logout} class="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
				Sign out
			</button>
			<span class="text-xs text-neutral-600">FLUX v1</span>
			<span class="w-2 h-2 rounded-full {chat.agentPhase === 'idle' ? 'bg-emerald-500' : chat.agentPhase === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'}"></span>
		</div>
	</header>

	<StatusIndicator />
	<MessageList />
	<InputBar onSend={handleSend} />
</div>
