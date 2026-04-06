<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	// Import to trigger theme initialization (sets data-theme on <html>)
	import '$lib/stores/theme.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
