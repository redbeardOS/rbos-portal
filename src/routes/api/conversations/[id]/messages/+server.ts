import { getSupabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const supabase = getSupabase();
	const { data, error } = await supabase
		.from('messages')
		.select('id, role, content, tool_calls, tool_call_id, agent, created_at')
		.eq('conversation_id', params.id)
		.order('created_at', { ascending: true });

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
