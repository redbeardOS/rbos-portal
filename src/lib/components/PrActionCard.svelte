<script lang="ts">
	import type { Message } from '$lib/stores/chat.svelte';

	let { message }: { message: Message } = $props();

	let merging = $state(false);
	let merged = $state(false);
	let mergeError = $state<string | null>(null);
	let diffText = $state<string | null>(null);
	let loadingDiff = $state(false);
	let showDiff = $state(false);

	const verdictConfig = $derived(
		({
			APPROVE: {
				label: 'Approved',
				icon: '✅',
				color: 'var(--rb-success)',
				bgColor: 'color-mix(in srgb, var(--rb-success) 10%, transparent)'
			},
			REQUEST_CHANGES: {
				label: 'Changes Requested',
				icon: '⚠️',
				color: 'var(--rb-warning)',
				bgColor: 'color-mix(in srgb, var(--rb-warning) 10%, transparent)'
			},
			COMMENT: {
				label: 'Reviewed',
				icon: '💬',
				color: 'var(--rb-info)',
				bgColor: 'color-mix(in srgb, var(--rb-info) 10%, transparent)'
			}
		})[message.verdict ?? 'COMMENT']
	);

	async function handleMerge() {
		if (!message.prNumber || merging) return;
		merging = true;
		mergeError = null;

		try {
			const res = await fetch(`/api/pr/${message.prNumber}/merge`, { method: 'POST' });
			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Merge failed' }));
				mergeError = err.error ?? `HTTP ${res.status}`;
				return;
			}
			merged = true;
		} catch (err) {
			mergeError = err instanceof Error ? err.message : 'Connection failed';
		} finally {
			merging = false;
		}
	}

	async function toggleDiff() {
		if (showDiff) {
			showDiff = false;
			return;
		}
		if (diffText) {
			showDiff = true;
			return;
		}
		if (!message.prNumber) return;

		loadingDiff = true;
		try {
			const res = await fetch(`/api/pr/${message.prNumber}/diff`);
			if (res.ok) {
				diffText = await res.text();
			}
		} catch {
			// Silently fail — user can fall back to GitHub link
		} finally {
			loadingDiff = false;
			showDiff = true;
		}
	}
</script>

<div class="mt-2 rounded-xl border p-3" style="border-color: var(--rb-border); background: var(--bg-raised)">
	<!-- Verdict badge + PR number -->
	<div class="flex items-center justify-between mb-2">
		<div class="flex items-center gap-2">
			<span
				class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
				style="color: {verdictConfig.color}; background: {verdictConfig.bgColor}"
			>
				<span>{verdictConfig.icon}</span>
				{verdictConfig.label}
			</span>
			<span class="text-xs" style="color: var(--text-muted)">PR #{message.prNumber}</span>
		</div>
	</div>

	<!-- Action buttons -->
	<div class="flex flex-wrap gap-2">
		{#if message.prUrl}
			<a
				href={message.prUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors"
				style="border-color: var(--rb-border); color: var(--text-body)"
			>
				<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
					<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
				</svg>
				View on GitHub
			</a>
		{/if}

		<button
			onclick={toggleDiff}
			class="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors"
			style="border-color: var(--rb-border); color: var(--text-body)"
		>
			{#if loadingDiff}
				<span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></span>
			{:else}
				<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
				</svg>
			{/if}
			{showDiff ? 'Hide Diff' : 'View Diff'}
		</button>

		{#if message.verdict === 'APPROVE' && !merged}
			<button
				onclick={handleMerge}
				disabled={merging}
				class="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
				style="background: var(--rb-success)"
			>
				{#if merging}
					<span class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
					Merging...
				{:else}
					<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					Merge PR
				{/if}
			</button>
		{/if}

		{#if merged}
			<span
				class="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
				style="color: var(--rb-success); background: color-mix(in srgb, var(--rb-success) 10%, transparent)"
			>
				✅ Merged
			</span>
		{/if}
	</div>

	{#if mergeError}
		<p class="mt-2 text-xs" style="color: var(--rb-error)">{mergeError}</p>
	{/if}

	<!-- Inline diff viewer -->
	{#if showDiff && diffText}
		<div
			class="mt-3 border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto"
			style="border-color: var(--rb-border)"
		>
			<pre class="text-[11px] leading-relaxed p-3 whitespace-pre" style="color: var(--text-body); background: var(--bg-deep)">{diffText}</pre>
		</div>
	{:else if showDiff && !diffText && !loadingDiff}
		<p class="mt-2 text-xs" style="color: var(--text-muted)">
			Could not load diff. View on GitHub instead.
		</p>
	{/if}
</div>
