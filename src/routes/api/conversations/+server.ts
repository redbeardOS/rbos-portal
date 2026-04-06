import { getSupabase } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/** GET /api/conversations — list recent conversations */
export const GET: RequestHandler = async ({ url }) => {
	const supabase = getSupabase();
	const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

	const { data, error } = await supabase
		.from('conversations')
		.select('id, title, created_at, updated_at')
		.order('updated_at', { ascending: false })
		.limit(limit);

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

/** POST /api/conversations — create a new conversation */
export const POST: RequestHandler = async ({ request }) => {
	const supabase = getSupabase();
	const body = await request.json();
	const title = (body.title as string) ?? null;

	const { data, error } = await supabase
		.from('conversations')
		.insert({ title })
		.select('id, title, created_at, updated_at')
		.single();

	if (error || !data) {
		return new Response(JSON.stringify({ error: error?.message ?? 'Failed to create' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify(data), {
		status: 201,
		headers: { 'Content-Type': 'application/json' }
	});
};

/** DELETE /api/conversations?id=<uuid> — delete a conversation (cascades to messages) */
export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) {
		return new Response(JSON.stringify({ error: 'id is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const supabase = getSupabase();
	const { error } = await supabase.from('conversations').delete().eq('id', id);

	if (error) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify({ deleted: id }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
