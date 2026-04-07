<script lang="ts">
	import type { ConversationListState } from '$lib/stores/conversations.svelte';
	import ThemePicker from './ThemePicker.svelte';

	let {
		state: convState,
		isOpen = $bindable(true),
		onSelect,
		onNew,
		onDelete
	}: {
		state: ConversationListState;
		isOpen: boolean;
		onSelect: (id: string) => void;
		onNew: () => void;
		onDelete: (id: string) => void;
	} = $props();

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHrs = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHrs < 24) return `${diffHrs}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	let confirmDeleteId = $state<string | null>(null);

	function handleDelete(id: string) {
		onDelete(id);
		confirmDeleteId = null;
	}
</script>

<aside
	class="transition-all duration-200 {isOpen
		? 'w-[260px]'
		: 'w-0'} overflow-hidden shrink-0 border-r h-full"
	style="border-color: var(--rb-border); background: var(--bg-deep)"
>
	<div class="w-[260px] h-full flex flex-col">
		<!-- Header -->
		<div class="p-3 border-b flex items-center justify-between" style="border-color: var(--rb-border)">
			<span class="text-xs font-medium uppercase tracking-wider" style="color: var(--text-muted)">Conversations</span>
			<button
				onclick={onNew}
				class="transition-colors p-1 rounded"
				style="color: var(--text-muted)"
				title="New conversation"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
			</button>
		</div>

		<!-- List -->
		<div class="flex-1 overflow-y-auto">
			{#if convState.loading}
				{#each [1, 2, 3] as _}
					<div class="px-3 py-2.5 border-l-2 border-transparent">
						<div class="h-4 rounded animate-pulse w-3/4" style="background: var(--bg-raised)"></div>
						<div class="h-3 rounded animate-pulse w-1/3 mt-1.5" style="background: var(--bg-raised); opacity: 0.5"></div>
					</div>
				{/each}
			{:else if convState.conversations.length === 0}
				<div class="p-4 text-center text-xs" style="color: var(--text-muted)">No conversations yet</div>
			{:else}
				{#each convState.conversations as conv (conv.id)}
					{#if confirmDeleteId === conv.id}
						<div class="px-3 py-2.5 border-l-2 flex items-center justify-between" style="border-color: var(--rb-error); background: var(--bg-raised)">
							<span class="text-xs" style="color: var(--text-muted)">Delete?</span>
							<div class="flex gap-2">
								<button onclick={() => handleDelete(conv.id)} class="text-xs transition-colors" style="color: var(--rb-error)">Yes</button>
								<button onclick={() => { confirmDeleteId = null; }} class="text-xs transition-colors" style="color: var(--text-muted)">No</button>
							</div>
						</div>
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							onclick={() => onSelect(conv.id)}
							onkeydown={(e) => { if (e.key === 'Enter') onSelect(conv.id); }}
							role="button"
							tabindex="0"
							class="w-full text-left px-3 py-2.5 transition-colors group cursor-pointer border-l-2"
							style="{convState.activeId === conv.id
								? `background: var(--bg-raised); border-color: var(--accent-primary)`
								: 'border-color: transparent'}"
						>
							<div class="text-sm truncate" style="color: var(--text-heading)">
								{conv.title || 'Untitled'}
							</div>
							<div class="text-xs mt-0.5 flex items-center justify-between" style="color: var(--text-muted)">
								<span>{formatTime(conv.updated_at)}</span>
								<button
									onclick={(e) => { e.stopPropagation(); confirmDeleteId = conv.id; }}
									class="opacity-0 group-hover:opacity-100 transition-all"
									style="color: var(--text-muted)"
									title="Delete conversation"
								>
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="3 6 5 6 21 6" />
										<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
									</svg>
								</button>
							</div>
						</div>
					{/if}
				{/each}
			{/if}
		</div>

		<!-- Theme picker at bottom -->
		<ThemePicker />
	</div>
</aside>
