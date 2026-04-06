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

<div class="flex min-h-screen items-center justify-center px-4" style="background: var(--bg-deep)">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-lg font-medium" style="color: var(--text-heading)">Dojo</h1>
			<p class="mt-1 text-sm" style="color: var(--text-muted)">Sign in to access the workspace</p>
		</div>

		{#if urlError === 'not_allowed'}
			<div class="mb-4 rounded border px-4 py-3 text-sm"
				style="border-color: color-mix(in srgb, var(--rb-error) 40%, transparent); background: color-mix(in srgb, var(--rb-error) 10%, transparent); color: var(--rb-error)">
				Access denied. Your email is not on the allowlist.
			</div>
		{/if}

		{#if sent}
			<div class="rounded border px-6 py-8 text-center" style="border-color: var(--rb-border); background: var(--bg-surface)">
				<div class="mb-2 text-2xl">📧</div>
				<p class="text-sm" style="color: var(--text-body)">Check your email</p>
				<p class="mt-1 text-xs" style="color: var(--text-muted)">
					We sent a magic link to <span style="color: var(--text-body)">{email}</span>
				</p>
				<button
					onclick={() => { sent = false; email = ''; }}
					class="mt-4 text-xs transition-colors"
					style="color: var(--text-muted)"
				>
					Try a different email
				</button>
			</div>
		{:else}
			<div class="rounded border px-6 py-6" style="border-color: var(--rb-border); background: var(--bg-surface)">
				{#if error}
					<div class="mb-4 text-sm" style="color: var(--rb-error)">{error}</div>
				{/if}

				<label for="email" class="block text-xs font-medium mb-1.5" style="color: var(--text-muted)">
					Email address
				</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					onkeydown={handleKeydown}
					placeholder="you@example.com"
					class="w-full rounded border px-3 py-2 text-sm outline-none transition-colors"
					style="border-color: var(--rb-border); background: var(--bg-raised); color: var(--text-heading)"
					disabled={loading}
				/>

				<button
					onclick={sendMagicLink}
					disabled={!email.trim() || loading}
					class="mt-4 w-full rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					style="background: var(--accent-primary); color: var(--bg-deep)"
				>
					{loading ? 'Sending...' : 'Send magic link'}
				</button>
			</div>

			<p class="mt-4 text-center text-xs" style="color: var(--text-muted); opacity: 0.6">
				Passwordless sign-in via email
			</p>
		{/if}
	</div>
</div>
