<script lang="ts">
	import type { Snippet } from 'svelte';
	import ConversationSidebar from '$lib/components/ConversationSidebar.svelte';
	import { ConversationListState } from '$lib/stores/conversations.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { setContext } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const convState = new ConversationListState();
	let sidebarOpen = $state(true);

	// Share sidebar toggle and convState with child routes
	setContext('sidebar', {
		get isOpen() {
			return sidebarOpen;
		},
		toggle() {
			sidebarOpen = !sidebarOpen;
		},
		convState
	});

	// Load conversations on mount
	$effect(() => {
		convState.load();
	});

	// Sync active conversation from URL
	$effect(() => {
		const c = $page.url.searchParams.get('c');
		if (c) {
			convState.setActive(c);
		}
	});

	function handleSelect(id: string) {
		convState.setActive(id);
		goto(`/dojo/chat?c=${id}`);
	}

	function handleNew() {
		convState.setActive(null);
		goto('/dojo/chat');
	}

	async function handleDelete(id: string) {
		await convState.remove(id);
		if (convState.activeId === null) {
			goto('/dojo/chat');
		}
	}
</script>

<div class="flex h-screen bg-neutral-950">
	<ConversationSidebar
		state={convState}
		bind:isOpen={sidebarOpen}
		onSelect={handleSelect}
		onNew={handleNew}
		onDelete={handleDelete}
	/>

	<div class="flex-1 flex flex-col min-w-0">
		{@render children()}
	</div>
</div>
