<script lang="ts">
	import type { Message } from '$lib/stores/chat.svelte';
	import PrActionCard from './PrActionCard.svelte';

	let { message }: { message: Message } = $props();

	const isUser = $derived(message.role === 'user');
	const isStreaming = $derived(message.status === 'streaming');
	const hasToolCalls = $derived((message.toolCalls?.length ?? 0) > 0);
	const showPrCard = $derived(
		message.agent === 'SAM' &&
			message.verdict !== undefined &&
			message.prNumber !== undefined &&
			message.status === 'complete'
	);
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'} mb-3">
	<div
		class="max-w-[95%] md:max-w-[80%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3 {isUser ? '' : 'border'}"
		style="{isUser
			? `background: var(--bg-raised); color: var(--text-heading)`
			: `background: var(--bg-surface); color: var(--text-body); border-color: var(--rb-border)`}"
	>
		{#if !isUser && message.agent}
			<div class="text-xs font-medium mb-1" style="color: var(--accent-primary)">{message.agent}</div>
		{/if}

		{#if hasToolCalls}
			<div class="mb-2 space-y-1">
				{#each message.toolCalls ?? [] as tc}
					<div
						class="text-xs font-mono px-2 py-1 rounded flex items-center gap-2"
						style="background: var(--bg-deep); color: var(--text-muted)"
					>
						{#if tc.status === 'running'}
							<span class="inline-block w-2 h-2 rounded-full animate-pulse" style="background: var(--rb-warning)"></span>
						{:else if tc.status === 'done'}
							<span class="inline-block w-2 h-2 rounded-full" style="background: var(--rb-success)"></span>
						{:else}
							<span class="inline-block w-2 h-2 rounded-full" style="background: var(--rb-error)"></span>
						{/if}
						<span>{tc.tool}</span>
					</div>
				{/each}
			</div>
		{/if}

		<div class="whitespace-pre-wrap break-words text-sm leading-relaxed">
			{message.content}{#if isStreaming}<span
					class="inline-block w-1.5 h-4 ml-0.5 animate-pulse align-middle"
					style="background: var(--accent-primary)"
				></span>{/if}
		</div>

		<div class="text-[10px] mt-1.5 {isUser ? 'text-right' : 'text-left'}" style="color: var(--text-muted)">
			{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
		</div>
	</div>
	{#if showPrCard}
		<div class="mt-1 max-w-[95%] md:max-w-[80%]">
			<PrActionCard {message} />
		</div>
	{/if}
</div>
