/**
 * Memory API — CRUD for agent memories, feedback, and skills.
 *
 * GET /api/memory?agent=flux — returns memories, feedback, skills for an agent
 * DELETE /api/memory?id=<uuid> — delete a memory by ID
 * PATCH /api/memory — update confidence or value for a memory
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSupabase } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url }) => {
	const agentId = url.searchParams.get('agent');
	if (!agentId) {
		return json({ error: 'agent query param required' }, { status: 400 });
	}

	const supabase = getSupabase();

	const [memories, feedback, skills] = await Promise.all([
		supabase
			.from('agent_memory')
			.select('*')
			.eq('agent_id', agentId)
			.order('confidence', { ascending: false }),
		supabase
			.from('agent_feedback')
			.select('*')
			.eq('agent_id', agentId)
			.order('created_at', { ascending: false })
			.limit(50),
		supabase
			.from('agent_skills')
			.select('*')
			.eq('agent_id', agentId)
			.order('success_rate', { ascending: false })
	]);

	return json({
		memories: memories.data ?? [],
		feedback: feedback.data ?? [],
		skills: skills.data ?? []
	});
};

export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) {
		return json({ error: 'id query param required' }, { status: 400 });
	}

	const supabase = getSupabase();
	const { error } = await supabase.from('agent_memory').delete().eq('id', id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}
	return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id, confidence, value } = body as {
		id: string;
		confidence?: number;
		value?: unknown;
	};

	if (!id) {
		return json({ error: 'id required' }, { status: 400 });
	}

	const supabase = getSupabase();
	const updates: Record<string, unknown> = {};
	if (confidence !== undefined) updates.confidence = Math.max(0, Math.min(1, confidence));
	if (value !== undefined) updates.value = value;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'Nothing to update' }, { status: 400 });
	}

	const { error } = await supabase.from('agent_memory').update(updates).eq('id', id);
	if (error) {
		return json({ error: error.message }, { status: 500 });
	}
	return json({ ok: true });
};
