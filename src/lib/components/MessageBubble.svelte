<script lang="ts">
	import type { Message } from '$lib/stores/chat.svelte';

	let { message }: { message: Message } = $props();

	const isUser = $derived(message.role === 'user');
	const isStreaming = $derived(message.status === 'streaming');
	const hasToolCalls = $derived((message.toolCalls?.length ?? 0) > 0);
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'} mb-3">
	<div
		class="max-w-[80%] rounded-2xl px-4 py-3 {isUser
			? 'bg-neutral-700 text-neutral-100'
			: 'bg-neutral-800/60 text-neutral-200 border border-neutral-700/50'}"
	>
		{#if !isUser && message.agent}
			<div class="text-xs font-medium text-emerald-400 mb-1">{message.agent}</div>
		{/if}

		{#if hasToolCalls}
			<div class="mb-2 space-y-1">
				{#each message.toolCalls ?? [] as tc}
					<div
						class="text-xs font-mono px-2 py-1 rounded bg-neutral-900/50 text-neutral-400 flex items-center gap-2"
					>
						{#if tc.status === 'running'}
							<span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"
							></span>
						{:else if tc.status === 'done'}
							<span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
						{:else}
							<span class="inline-block w-2 h-2 rounded-full bg-red-400"></span>
						{/if}
						<span>{tc.tool}</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="whitespace-pre-wrap break-words text-sm leading-relaxed">
			{message.content}{#if isStreaming}<span
					class="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse align-middle"
				></span>{/if}
		</div>

		<div class="text-[10px] text-neutral-500 mt-1.5 {isUser ? 'text-right' : 'text-left'}">
			{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
		</div>
	</div>
</div>
