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

		{#if message.prUrl}
			<a
				href={message.prUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
			>
				<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
					<path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z"/>
				</svg>
				PR #{message.prNumber}
			</a>
		{/if}

		<div class="text-[10px] text-neutral-500 mt-1.5 {isUser ? 'text-right' : 'text-left'}">
			{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
		</div>
	</div>
</div>
