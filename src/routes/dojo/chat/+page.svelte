<script lang="ts">
	import { ChatState, setChatState, type Message } from '$lib/stores/chat.svelte';
	import MessageList from '$lib/components/MessageList.svelte';
	import InputBar from '$lib/components/InputBar.svelte';
	import StatusIndicator from '$lib/components/StatusIndicator.svelte';
	import { createSupabaseBrowser } from '$lib/supabase';
	import { subscribeToPush, isPushSubscribed } from '$lib/push';
	import AgentSelector from '$lib/components/AgentSelector.svelte';
	import { agentState } from '$lib/stores/agents.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getContext } from 'svelte';
	import { browser } from '$app/environment';
	import type { ConversationListState } from '$lib/stores/conversations.svelte';

	const chat = new ChatState();
	setChatState(chat);

	const supabase = createSupabaseBrowser();
	const sidebar: { isOpen: boolean; toggle: () => void; convState: ConversationListState } =
		getContext('sidebar');

	// Load agents on mount
	$effect(() => {
		agentState.load();
	});

	let showPushPrompt = $state(false);

	// Check push status on mount
	$effect(() => {
		if (browser) {
			isPushSubscribed().then((subscribed) => {
				if (!subscribed && Notification.permission === 'default') {
					setTimeout(() => {
						showPushPrompt = true;
					}, 3000);
				}
			});
		}
	});

	async function enablePush() {
		await subscribeToPush();
		showPushPrompt = false;
	}

	function dismissPush() {
		showPushPrompt = false;
	}

	async function logout() {
		await supabase.auth.signOut();
		goto('/dojo');
	}

	// Load conversation from URL param on mount / navigation
	$effect(() => {
		const c = $page.url.searchParams.get('c');
		if (c && c !== chat.conversationId) {
			chat.setConversationId(c);
			loadConversation(c);
		} else if (!c && chat.conversationId) {
			chat.startNewConversation();
		}
	});

	async function loadConversation(id: string) {
		const res = await fetch(`/api/conversations/${id}/messages`);
		if (!res.ok) return;
		const messages = await res.json();
		chat.loadFromHistory(messages);
	}

	// Poll for new messages when not streaming (cross-device sync)
	$effect(() => {
		let interval: ReturnType<typeof setInterval> | null = null;
		if (chat.conversationId && !chat.isStreaming) {
			interval = setInterval(async () => {
				const res = await fetch(`/api/conversations/${chat.conversationId}/messages`);
				if (!res.ok) return;
				const messages = await res.json();
				if (messages.length > chat.messages.length) {
					chat.loadFromHistory(messages);
				}
			}, 5000);
		}
		return () => {
			if (interval) clearInterval(interval);
		};
	});

	async function handleSend(message: string) {
		chat.clearError();
		chat.addUserMessage(message);
		const agentMsg = chat.startAgentMessage('FLUX');
		let samMsg: Message | null = null;
		let lastPrUrl = '';
		let lastPrNumber = 0;

		try {
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					agent: agentState.selectedId,
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
									// Update URL without full navigation
									{
										const url = new URL(window.location.href);
										url.searchParams.set('c', parsed.id);
										history.replaceState({}, '', url.toString());
									}
									// Update sidebar
									sidebar.convState.setActive(parsed.id);
									sidebar.convState.upsert({
										id: parsed.id,
										title: message.slice(0, 100),
										created_at: new Date().toISOString(),
										updated_at: new Date().toISOString()
									});
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
									lastPrUrl = parsed.url;
									lastPrNumber = parsed.number;
									break;
								case 'error':
									chat.setError(agentMsg.id, parsed.message);
									return;
								case 'done':
									chat.completeAgentMessage(agentMsg.id);
									break;
								case 'agent_start':
									if (parsed.agent === 'SAM') {
										samMsg = chat.startSamReview();
									}
									break;
								case 'sam_token':
									if (samMsg) chat.appendToken(samMsg.id, parsed.content);
									break;
								case 'sam_done':
									if (samMsg) {
										chat.setVerdict(samMsg.id, parsed.verdict);
										if (lastPrNumber) {
											chat.setPrOpened(samMsg.id, lastPrUrl, lastPrNumber);
										}
										chat.completeAgentMessage(samMsg.id);
										samMsg = null;
									}
									break;
								case 'sam_error':
									if (samMsg) {
										chat.setError(samMsg.id, parsed.message);
										samMsg = null;
									}
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

<div class="flex flex-col h-full" style="background: var(--bg-surface); color: var(--text-body)">
	<header
		class="shrink-0 border-b px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between backdrop-blur-sm"
		style="border-color: var(--rb-border); background: var(--bg-deep)"
	>
		<div class="flex items-center gap-2 md:gap-3">
			<button
				onclick={() => sidebar.toggle()}
				class="transition-colors"
				style="color: var(--text-muted)"
				title="Toggle sidebar"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			</button>
			<a href="/" class="hidden md:inline text-sm transition-colors" style="color: var(--text-muted)">
				Portal
			</a>
			<span class="hidden md:inline" style="color: var(--rb-border)">/</span>
			<h1 class="text-sm font-medium" style="color: var(--text-heading)">Dojo</h1>
			<span style="color: var(--rb-border)">/</span>
			<AgentSelector />
		</div>
		<div class="flex items-center gap-2 md:gap-3">
			<button
				onclick={() => {
					if (chat.conversationId) loadConversation(chat.conversationId);
				}}
				class="text-xs transition-colors"
				style="color: var(--text-muted)"
				title="Refresh messages"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="23 4 23 10 17 10" />
					<polyline points="1 20 1 14 7 14" />
					<path d="m3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
				</svg>
			</button>
			<button
				onclick={logout}
				class="text-xs transition-colors"
				style="color: var(--text-muted)"
			>
				Sign out
			</button>
			<span class="hidden md:inline text-xs" style="color: var(--text-muted)">FLUX v1</span>
			<span
				class="w-2 h-2 rounded-full {chat.agentPhase === 'idle' ? '' : chat.agentPhase === 'error' ? '' : 'animate-pulse'}"
				style="background: {chat.agentPhase === 'idle' ? 'var(--rb-success)' : chat.agentPhase === 'error' ? 'var(--rb-error)' : 'var(--rb-warning)'}"
			></span>
		</div>
	</header>

	<StatusIndicator />
	<MessageList />
	{#if showPushPrompt}
		<div
			class="mx-3 mb-2 rounded-xl border p-3 flex items-center justify-between"
			style="border-color: var(--rb-border); background: var(--bg-raised)"
		>
			<div class="flex items-center gap-2">
				<span class="text-sm">🔔</span>
				<span class="text-xs" style="color: var(--text-body)">
					Get notified when agents need your attention?
				</span>
			</div>
			<div class="flex gap-2">
				<button
					onclick={enablePush}
					class="text-xs font-medium px-2 py-1 rounded"
					style="color: var(--accent-primary)">Enable</button
				>
				<button
					onclick={dismissPush}
					class="text-xs px-2 py-1 rounded"
					style="color: var(--text-muted)">Later</button
				>
			</div>
		</div>
	{/if}
	<InputBar onSend={handleSend} />
</div>
