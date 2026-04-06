<script lang="ts">
	import type { Snippet } from 'svelte';
	import ConversationSidebar from '$lib/components/ConversationSidebar.svelte';
	import { ConversationListState } from '$lib/stores/conversations.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { setContext } from 'svelte';
	import { browser } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	const convState = new ConversationListState();
	let sidebarOpen = $state(true);

	$effect(() => {
		if (browser) {
			sidebarOpen = window.innerWidth >= 768;
		}
	});

	setContext('sidebar', {
		get isOpen() {
			return sidebarOpen;
		},
		toggle() {
			sidebarOpen = !sidebarOpen;
		},
		convState
	});

	$effect(() => {
		convState.load();
	});

	$effect(() => {
		const c = $page.url.searchParams.get('c');
		if (c) {
			convState.setActive(c);
		}
	});

	function handleSelect(id: string) {
		convState.setActive(id);
		goto(`/dojo/chat?c=${id}`);
		if (browser && window.innerWidth < 768) sidebarOpen = false;
	}

	function handleNew() {
		convState.setActive(null);
		goto('/dojo/chat');
		if (browser && window.innerWidth < 768) sidebarOpen = false;
	}

	async function handleDelete(id: string) {
		await convState.remove(id);
		if (convState.activeId === null) goto('/dojo/chat');
	}
</script>

<div class="flex h-screen" style="background: var(--bg-deep)">
	<!-- Mobile backdrop -->
	{#if sidebarOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-30 md:hidden"
			style="background: rgba(0,0,0,0.5)"
			onclick={() => {
				sidebarOpen = false;
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape') sidebarOpen = false;
			}}
		></div>
	{/if}

	<!-- Sidebar -->
	<div
		class="{sidebarOpen
			? 'translate-x-0'
			: '-translate-x-full'} fixed md:static md:translate-x-0 z-40 md:z-auto transition-transform duration-200 ease-in-out h-full"
	>
		<ConversationSidebar
			state={convState}
			bind:isOpen={sidebarOpen}
			onSelect={handleSelect}
			onNew={handleNew}
			onDelete={handleDelete}
		/>
	</div>

	<div class="flex-1 flex flex-col min-w-0">
		{@render children()}
	</div>
</div>
