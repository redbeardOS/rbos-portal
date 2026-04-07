import { browser } from '$app/environment';

export interface AgentInfo {
	id: string;
	name: string;
	role: string;
	description: string;
	color: string;
}

function createAgentState() {
	let agents = $state<AgentInfo[]>([]);
	let selectedId = $state<string>('flux');
	let loaded = $state(false);

	async function load() {
		if (!browser) return;
		try {
			const res = await fetch('/api/agents');
			if (res.ok) {
				agents = await res.json();
			}
		} catch {
			agents = [
				{
					id: 'flux',
					name: 'FLUX',
					role: 'Staff Architect',
					description: 'Writes code, reviews architecture',
					color: 'var(--accent-primary)'
				}
			];
		}
		loaded = true;
	}

	return {
		get agents() {
			return agents;
		},
		get selectedId() {
			return selectedId;
		},
		get selected() {
			return agents.find((a) => a.id === selectedId) ?? agents[0];
		},
		get loaded() {
			return loaded;
		},
		select(id: string) {
			if (agents.some((a) => a.id === id)) {
				selectedId = id;
			}
		},
		load
	};
}

export const agentState = createAgentState();
