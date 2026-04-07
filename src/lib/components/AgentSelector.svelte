<script lang="ts">
	import { agentState } from '$lib/stores/agents.svelte';

	let open = $state(false);

	function select(id: string) {
		agentState.select(id);
		open = false;
	}

	function handleClickOutside(e: MouseEvent) {
		if (!(e.target as Element).closest('.agent-selector')) {
			open = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="agent-selector relative">
	<button
		onclick={() => {
			open = !open;
		}}
		class="flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors text-sm"
		style="border-color: var(--rb-border); color: var(--text-heading)"
	>
		<span
			class="w-2 h-2 rounded-full"
			style="background: {agentState.selected?.color ?? 'var(--accent-primary)'}"
		></span>
		<span class="font-medium">{agentState.selected?.name ?? 'FLUX'}</span>
		<svg
			class="w-3 h-3 transition-transform {open ? 'rotate-180' : ''}"
			style="color: var(--text-muted)"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<div
			class="absolute top-full left-0 mt-1 min-w-[200px] rounded-xl border shadow-lg z-50"
			style="background: var(--bg-raised); border-color: var(--rb-border)"
		>
			{#each agentState.agents as agent (agent.id)}
				<button
					onclick={() => select(agent.id)}
					class="w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors first:rounded-t-xl last:rounded-b-xl"
					style="{agentState.selectedId === agent.id ? 'background: var(--bg-surface)' : ''}"
				>
					<span
						class="w-2 h-2 rounded-full shrink-0"
						style="background: {agent.color}"
					></span>
					<div>
						<div class="text-sm font-medium" style="color: var(--text-heading)">
							{agent.name}
						</div>
						<div class="text-xs" style="color: var(--text-muted)">{agent.role}</div>
					</div>
					{#if agentState.selectedId === agent.id}
						<svg
							class="w-4 h-4 ml-auto shrink-0"
							style="color: var(--accent-primary)"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							viewBox="0 0 24 24"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
