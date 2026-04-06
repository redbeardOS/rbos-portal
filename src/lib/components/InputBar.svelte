<script lang="ts">
	import { getChatState } from '$lib/stores/chat.svelte';

	let { onSend }: { onSend: (message: string) => void } = $props();

	const chat = getChatState();
	let input = $state('');
	let textarea: HTMLTextAreaElement;

	const canSend = $derived(input.trim().length > 0 && !chat.isStreaming);

	function handleSend() {
		if (!canSend) return;
		onSend(input.trim());
		input = '';
		if (textarea) {
			textarea.style.height = 'auto';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	function autoResize() {
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
		}
	}
</script>

<div class="border-t border-neutral-800 px-3 md:px-4 py-2.5 md:py-3 bg-neutral-950/80 backdrop-blur-sm">
	{#if chat.error}
		<div class="mb-2 px-3 py-2 rounded-lg bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center justify-between">
			<span>{chat.error}</span>
			<button
				onclick={() => chat.clearError()}
				class="text-red-400 hover:text-red-200 ml-2 text-xs"
			>
				dismiss
			</button>
		</div>
	{/if}

	<div class="flex items-end gap-2">
		<textarea
			bind:this={textarea}
			bind:value={input}
			onkeydown={handleKeydown}
			oninput={autoResize}
			placeholder={chat.isStreaming ? 'FLUX is working...' : 'Message FLUX...'}
			disabled={chat.isStreaming}
			rows={1}
			class="flex-1 resize-none rounded-xl bg-neutral-800/80 border border-neutral-700/50 px-3 md:px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-600/50 focus:ring-1 focus:ring-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
		></textarea>

		<button
			onclick={handleSend}
			disabled={!canSend}
			class="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-700 disabled:cursor-not-allowed px-3 md:px-4 py-2.5 text-sm font-medium text-white transition-colors"
		>
			Send
		</button>
	</div>
</div>
