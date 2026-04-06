<script lang="ts">
	import { getChatState, type AgentPhase } from '$lib/stores/chat.svelte';

	const chat = getChatState();

	const labels: Record<AgentPhase, string> = {
		idle: '',
		thinking: 'FLUX is thinking...',
		coding: 'FLUX is writing code...',
		committing: 'FLUX is committing changes...',
		error: 'Something went wrong'
	};

	const isActive = $derived(chat.agentPhase !== 'idle');
	const label = $derived(labels[chat.agentPhase]);
</script>

{#if isActive}
	<div class="px-4 py-1.5 border-b border-neutral-800/50 bg-neutral-900/50">
		<div class="flex items-center gap-2 text-xs">
			{#if chat.agentPhase === 'error'}
				<span class="w-2 h-2 rounded-full bg-red-400"></span>
				<span class="text-red-400">{label}</span>
			{:else}
				<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
				<span class="text-neutral-400">{label}</span>
			{/if}
		</div>
	</div>
{/if}
