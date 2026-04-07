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

<div class="border-t px-3 md:px-4 py-2.5 md:py-3 backdrop-blur-sm" style="border-color: var(--rb-border); background: var(--bg-deep)">
	{#if chat.error}
		<div class="mb-2 px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
			style="background: color-mix(in srgb, var(--rb-error) 10%, transparent); border-color: color-mix(in srgb, var(--rb-error) 30%, transparent); color: var(--rb-error)">
			<span>{chat.error}</span>
			<button
				onclick={() => chat.clearError()}
				class="ml-2 text-xs transition-colors"
				style="color: var(--rb-error)"
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
			class="flex-1 resize-none rounded-xl border px-3 md:px-4 py-2.5 text-base focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			style="background: var(--bg-raised); border-color: var(--rb-border); color: var(--text-heading)"
		></textarea>

		<button
			onclick={handleSend}
			disabled={!canSend}
			class="shrink-0 rounded-xl px-3 md:px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
			style="background: var(--accent-primary)"
		>
			Send
		</button>
	</div>
</div>

<style>
	textarea:focus {
		border-color: color-mix(in srgb, var(--accent-primary) 50%, transparent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 30%, transparent);
	}
</style>
