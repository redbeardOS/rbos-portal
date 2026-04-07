import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSelectableAgents } from '$lib/server/agents/registry';

export const GET: RequestHandler = async () => {
	const agents = getSelectableAgents().map((a) => ({
		id: a.id,
		name: a.name,
		role: a.role,
		description: a.description,
		color: a.color
	}));
	return json(agents);
};
