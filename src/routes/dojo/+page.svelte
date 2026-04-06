<script lang="ts">
	import { createSupabaseBrowser } from '$lib/supabase';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let email = $state('');
	let sent = $state(false);
	let error = $state('');
	let loading = $state(false);

	const supabase = createSupabaseBrowser();

	// If already authenticated, redirect to chat
	const { data } = $derived($page);
	$effect(() => {
		if (data.session) {
			goto('/dojo/chat');
		}
	});

	// Check for error in URL params
	const urlError = $derived($page.url.searchParams.get('error'));

	async function sendMagicLink() {
		loading = true;
		error = '';
		const { error: err } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${window.location.origin}/dojo/auth/callback`
			}
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			sent = true;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && email.trim() && !loading) {
			sendMagicLink();
		}
	}
</script>

<svelte:head>
	<title>Sign in — Dojo</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-lg font-medium text-neutral-100">Dojo</h1>
			<p class="mt-1 text-sm text-neutral-500">Sign in to access the workspace</p>
		</div>

		{#if urlError === 'not_allowed'}
			<div class="mb-4 rounded border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
				Access denied. Your email is not on the allowlist.
			</div>
		{/if}

		{#if sent}
			<div class="rounded border border-neutral-800 bg-neutral-900 px-6 py-8 text-center">
				<div class="mb-2 text-2xl">📧</div>
				<p class="text-sm text-neutral-300">Check your email</p>
				<p class="mt-1 text-xs text-neutral-500">
					We sent a magic link to <span class="text-neutral-400">{email}</span>
				</p>
				<button
					onclick={() => { sent = false; email = ''; }}
					class="mt-4 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
				>
					Try a different email
				</button>
			</div>
		{:else}
			<div class="rounded border border-neutral-800 bg-neutral-900 px-6 py-6">
				{#if error}
					<div class="mb-4 text-sm text-red-400">{error}</div>
				{/if}

				<label for="email" class="block text-xs font-medium text-neutral-400 mb-1.5">
					Email address
				</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					onkeydown={handleKeydown}
					placeholder="you@example.com"
					class="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
					disabled={loading}
				/>

				<button
					onclick={sendMagicLink}
					disabled={!email.trim() || loading}
					class="mt-4 w-full rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{loading ? 'Sending...' : 'Send magic link'}
				</button>
			</div>

			<p class="mt-4 text-center text-xs text-neutral-600">
				Passwordless sign-in via email
			</p>
		{/if}
	</div>
</div>
