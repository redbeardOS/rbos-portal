<script lang="ts">
	import { browser } from '$app/environment';
	import { agentState, type AgentInfo } from '$lib/stores/agents.svelte';

	interface MemoryEntry {
		id: string;
		agent_id: string;
		category: string;
		key: string;
		value: unknown;
		confidence: number;
		source: string | null;
		updated_at: string;
	}

	interface FeedbackEntry {
		id: string;
		source_agent: string;
		pr_number: number | null;
		feedback_type: string;
		content: string;
		applied: boolean;
		created_at: string;
	}

	interface SkillEntry {
		id: string;
		skill_name: string;
		description: string;
		instruction_text: string;
		usage_count: number;
		success_rate: number;
	}

	let selectedAgent = $state('flux');
	let memories = $state<MemoryEntry[]>([]);
	let feedback = $state<FeedbackEntry[]>([]);
	let skills = $state<SkillEntry[]>([]);
	let loading = $state(false);
	let expandedId = $state<string | null>(null);
	let tab = $state<'memories' | 'feedback' | 'skills'>('memories');

	$effect(() => {
		agentState.load();
	});

	$effect(() => {
		if (browser && selectedAgent) {
			loadData(selectedAgent);
		}
	});

	async function loadData(agentId: string) {
		loading = true;
		try {
			const res = await fetch(`/api/memory?agent=${agentId}`);
			if (res.ok) {
				const data = await res.json();
				memories = data.memories;
				feedback = data.feedback;
				skills = data.skills;
			}
		} catch {
			// silently fail
		}
		loading = false;
	}

	async function deleteMemory(id: string) {
		const res = await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			memories = memories.filter((m) => m.id !== id);
		}
	}

	async function updateConfidence(id: string, confidence: number) {
		await fetch('/api/memory', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, confidence })
		});
	}

	async function runAbsorb() {
		loading = true;
		const res = await fetch('/api/absorb', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ agentId: selectedAgent })
		});
		if (res.ok) {
			await loadData(selectedAgent);
		}
		loading = false;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatValue(val: unknown): string {
		if (typeof val === 'string') return val;
		return JSON.stringify(val, null, 2);
	}

	function confidenceColor(c: number): string {
		if (c >= 0.7) return 'var(--rb-success)';
		if (c >= 0.4) return 'var(--rb-warning)';
		return 'var(--rb-error)';
	}

	function feedbackTypeColor(type: string): string {
		if (type === 'approve') return 'var(--rb-success)';
		if (type === 'anti_pattern') return 'var(--rb-error)';
		if (type === 'request_changes') return 'var(--rb-warning)';
		return 'var(--text-muted)';
	}
</script>

<div class="min-h-screen p-4 md:p-8" style="background: var(--bg-deep); color: var(--text-body)">
	<div class="max-w-5xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-bold" style="color: var(--text-heading)">Agent Memory</h1>
				<p class="text-sm mt-1" style="color: var(--text-muted)">
					Inspect and manage what agents have learned
				</p>
			</div>
			<div class="flex items-center gap-3">
				<button
					onclick={runAbsorb}
					class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
					style="background: var(--accent-primary); color: var(--bg-deep)"
					disabled={loading}
				>
					{loading ? 'Processing...' : 'Run Absorb'}
				</button>
				<a
					href="/dojo/chat"
					class="px-3 py-1.5 rounded-lg text-sm border transition-colors"
					style="border-color: var(--rb-border); color: var(--text-muted)"
				>
					Back to Chat
				</a>
			</div>
		</div>

		<!-- Agent Tabs -->
		<div class="flex gap-1 mb-6 overflow-x-auto pb-1">
			{#each agentState.agents as agent (agent.id)}
				<button
					onclick={() => { selectedAgent = agent.id; }}
					class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
					style="{selectedAgent === agent.id
						? `background: var(--bg-raised); color: var(--text-heading); border: 1px solid ${agent.color}`
						: 'background: transparent; color: var(--text-muted); border: 1px solid transparent'}"
				>
					<span class="inline-block w-2 h-2 rounded-full mr-1.5" style="background: {agent.color}"></span>
					{agent.name}
				</button>
			{/each}
		</div>

		<!-- Section Tabs -->
		<div class="flex gap-4 mb-4 border-b" style="border-color: var(--rb-border)">
			{#each [
				{ key: 'memories', label: 'Memories', count: memories.length },
				{ key: 'feedback', label: 'Feedback', count: feedback.length },
				{ key: 'skills', label: 'Skills', count: skills.length }
			] as t (t.key)}
				<button
					onclick={() => { tab = t.key as typeof tab; }}
					class="pb-2 text-sm font-medium transition-colors"
					style="{tab === t.key
						? 'color: var(--text-heading); border-bottom: 2px solid var(--accent-primary)'
						: 'color: var(--text-muted); border-bottom: 2px solid transparent'}"
				>
					{t.label}
					<span class="ml-1 text-xs opacity-60">({t.count})</span>
				</button>
			{/each}
		</div>

		<!-- Content -->
		{#if loading}
			<div class="text-center py-12" style="color: var(--text-muted)">Loading...</div>
		{:else if tab === 'memories'}
			{#if memories.length === 0}
				<div class="text-center py-12" style="color: var(--text-muted)">
					No memories yet. This agent hasn't learned anything.
				</div>
			{:else}
				<div class="space-y-2">
					{#each memories as mem (mem.id)}
						<div
							class="rounded-xl border p-3"
							style="background: var(--bg-surface); border-color: var(--rb-border)"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 mb-1">
										<span
											class="px-1.5 py-0.5 rounded text-xs font-medium"
											style="background: var(--bg-raised); color: var(--text-muted)"
										>
											{mem.category}
										</span>
										<span class="text-sm font-medium truncate" style="color: var(--text-heading)">
											{mem.key}
										</span>
									</div>
									<div class="text-sm truncate" style="color: var(--text-body)">
										{#if expandedId === mem.id}
											<pre class="whitespace-pre-wrap text-xs mt-1 p-2 rounded" style="background: var(--bg-deep)">{formatValue(mem.value)}</pre>
										{:else}
											{formatValue(mem.value).slice(0, 120)}{formatValue(mem.value).length > 120 ? '...' : ''}
										{/if}
									</div>
									{#if mem.source}
										<div class="text-xs mt-1" style="color: var(--text-muted)">
											Source: {mem.source} · Updated: {formatDate(mem.updated_at)}
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-2 shrink-0">
									<!-- Confidence bar -->
									<div class="flex items-center gap-1.5">
										<div class="w-16 h-1.5 rounded-full" style="background: var(--bg-deep)">
											<div
												class="h-full rounded-full transition-all"
												style="width: {mem.confidence * 100}%; background: {confidenceColor(mem.confidence)}"
											></div>
										</div>
										<span class="text-xs font-mono" style="color: {confidenceColor(mem.confidence)}">
											{(mem.confidence * 100).toFixed(0)}%
										</span>
									</div>
									<button
										onclick={() => { expandedId = expandedId === mem.id ? null : mem.id; }}
										class="p-1 rounded transition-colors"
										style="color: var(--text-muted)"
										title="Expand"
									>
										<svg class="w-4 h-4 transition-transform {expandedId === mem.id ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
										</svg>
									</button>
									<button
										onclick={() => deleteMemory(mem.id)}
										class="p-1 rounded transition-colors"
										style="color: var(--rb-error)"
										title="Delete"
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
										</svg>
									</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if tab === 'feedback'}
			{#if feedback.length === 0}
				<div class="text-center py-12" style="color: var(--text-muted)">
					No feedback recorded yet.
				</div>
			{:else}
				<div class="space-y-2">
					{#each feedback as fb (fb.id)}
						<div
							class="rounded-xl border p-3"
							style="background: var(--bg-surface); border-color: var(--rb-border)"
						>
							<div class="flex items-center gap-2 mb-1">
								<span
									class="px-1.5 py-0.5 rounded text-xs font-medium"
									style="color: {feedbackTypeColor(fb.feedback_type)}"
								>
									{fb.feedback_type}
								</span>
								<span class="text-xs" style="color: var(--text-muted)">
									from {fb.source_agent}
									{fb.pr_number ? ` · PR #${fb.pr_number}` : ''}
									· {formatDate(fb.created_at)}
								</span>
								{#if fb.applied}
									<span class="px-1.5 py-0.5 rounded text-xs" style="background: var(--bg-raised); color: var(--rb-success)">
										absorbed
									</span>
								{/if}
							</div>
							<div class="text-sm" style="color: var(--text-body)">
								{fb.content.slice(0, 200)}{fb.content.length > 200 ? '...' : ''}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if tab === 'skills'}
			{#if skills.length === 0}
				<div class="text-center py-12" style="color: var(--text-muted)">
					No skills yet. Skills are promoted from high-confidence patterns.
				</div>
			{:else}
				<div class="space-y-2">
					{#each skills as skill (skill.id)}
						<div
							class="rounded-xl border p-3"
							style="background: var(--bg-surface); border-color: var(--rb-border)"
						>
							<div class="flex items-center justify-between mb-1">
								<span class="text-sm font-medium" style="color: var(--text-heading)">
									{skill.skill_name}
								</span>
								<div class="flex items-center gap-3 text-xs" style="color: var(--text-muted)">
									<span>Used: {skill.usage_count}x</span>
									<span>Success: {(skill.success_rate * 100).toFixed(0)}%</span>
								</div>
							</div>
							<div class="text-sm" style="color: var(--text-body)">
								{skill.description}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
