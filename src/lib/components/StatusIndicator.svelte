<script lang="ts">
	import { getChatState, type AgentPhase } from '$lib/stores/chat.svelte';

	const chat = getChatState();

	const labels: Record<AgentPhase, string> = {
		idle: '',
		thinking: 'FLUX is thinking...',
		coding: 'FLUX is writing code...',
		committing: 'FLUX is committing changes...',
		reviewing: 'SAM is reviewing the PR...',
		error: 'Something went wrong'
	};

	const isActive = $derived(chat.agentPhase !== 'idle');
	const label = $derived(labels[chat.agentPhase]);
</script>

{#if isActive}
	<div class="px-3 md:px-4 py-1.5 border-b" style="border-color: color-mix(in srgb, var(--rb-border) 50%, transparent); background: var(--bg-raised)">
		<div class="flex items-center gap-2 text-xs">
			{#if chat.agentPhase === 'error'}
				<span class="w-2 h-2 rounded-full" style="background: var(--rb-error)"></span>
				<span style="color: var(--rb-error)">{chat.error ?? label}</span>
			{:else}
				<span class="w-2 h-2 rounded-full animate-pulse" style="background: var(--rb-success)"></span>
				<span style="color: var(--text-muted)">{label}</span>
			{/if}
		</div>
	</div>
{/if}
