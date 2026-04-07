import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServer } from '$lib/server/supabase-auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const supabase = createSupabaseServer(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) throw error(401, 'Not authenticated');

	const subscription = await request.json();

	const { error: dbErr } = await supabase.from('push_subscriptions').upsert(
		{
			user_id: user.id,
			endpoint: subscription.endpoint,
			keys_p256dh: subscription.keys.p256dh,
			keys_auth: subscription.keys.auth
		},
		{ onConflict: 'user_id,endpoint' }
	);

	if (dbErr) throw error(500, dbErr.message);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const supabase = createSupabaseServer(cookies);
	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) throw error(401, 'Not authenticated');

	const { endpoint } = await request.json();
	await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint);

	return json({ ok: true });
};
