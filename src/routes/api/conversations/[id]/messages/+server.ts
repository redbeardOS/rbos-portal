import { getSupabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const supabase = getSupabase();
	const since = url.searchParams.get('since');

	let query = supabase
		.from('messages')
		.select('id, role, content, tool_calls, tool_call_id, agent, created_at')
		.eq('conversation_id', params.id)
		.order('created_at', { ascending: true });

	if (since) {
		query = query.gt('created_at', since);
	}

	const { data, error } = await query;

	if (error) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify(data), {
		headers: { 'Content-Type': 'application/json' }
	});
};
