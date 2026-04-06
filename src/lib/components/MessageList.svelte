<script lang="ts">
	import { getChatState } from '$lib/stores/chat.svelte';
	import MessageBubble from './MessageBubble.svelte';

	const chat = getChatState();

	let container: HTMLDivElement;
	let userScrolledUp = $state(false);

	function handleScroll() {
		if (!container) return;
		const { scrollTop, scrollHeight, clientHeight } = container;
		userScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
	}

	$effect(() => {
		// Trigger on message count or content changes
		const _ = chat.messages.length;
		const last = chat.messages.at(-1);
		const __ = last?.content;

		if (!userScrolledUp && container) {
			requestAnimationFrame(() => {
				container.scrollTop = container.scrollHeight;
			});
		}
	});
</script>

<div
	bind:this={container}
	onscroll={handleScroll}
	class="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
>
	{#if chat.messages.length === 0}
		<div class="flex items-center justify-center h-full">
			<div class="text-center space-y-2">
				<p class="text-neutral-500 text-sm">No messages yet.</p>
				<p class="text-neutral-600 text-xs">Send a message to start a conversation with FLUX.</p>
			</div>
		</div>
	{:else}
		{#each chat.messages as message (message.id)}
			<MessageBubble {message} />
		{/each}
	{/if}
</div>
