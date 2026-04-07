<script lang="ts">
	import { themeState, THEMES } from '$lib/stores/theme.svelte';
</script>

<div class="p-3 border-t" style="border-color: var(--rb-border)">
	<span class="text-[11px] font-medium uppercase tracking-wider" style="color: var(--text-muted)">
		Theme
	</span>
	<div class="mt-2 grid grid-cols-4 gap-1.5">
		{#each THEMES as theme (theme.id)}
			<button
				onclick={() => themeState.set(theme.id)}
				class="group relative w-full aspect-square rounded-lg border transition-all duration-150
					{themeState.current === theme.id
					? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]'
					: 'border-[var(--rb-border)] hover:border-[var(--text-muted)]'}"
				style="background: {theme.preview.bg}"
				title={theme.label}
			>
				<span
					class="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full"
					style="background: {theme.preview.accent}"
				></span>
			</button>
		{/each}
	</div>
	<p class="mt-1.5 text-[11px] truncate" style="color: var(--text-muted)">
		{themeState.meta.label}
	</p>
</div>
