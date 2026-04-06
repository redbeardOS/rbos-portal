import { createSupabaseServer } from '$lib/server/supabase-auth';
import { redirect, type Handle } from '@sveltejs/kit';

const ALLOWED_EMAILS = ['alex@chisholm79.com'];
const PUBLIC_PATHS = ['/', '/api/health', '/dojo/auth/callback'];

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = createSupabaseServer(event.cookies);
	const {
		data: { session }
	} = await supabase.auth.getSession();

	event.locals.session = session;
	event.locals.supabase = supabase;

	const path = event.url.pathname;

	// Public paths — no auth required
	if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p))) {
		return resolve(event);
	}

	// /dojo (exact) — login page, always accessible
	if (path === '/dojo' || path === '/dojo/') {
		return resolve(event);
	}

	// Protected paths: /dojo/*, /api/* (except /api/health)
	if (path.startsWith('/dojo/') || path.startsWith('/api/')) {
		if (!session) {
			if (path.startsWith('/api/')) {
				return new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw redirect(303, '/dojo');
		}

		// Check email allowlist
		if (!ALLOWED_EMAILS.includes(session.user.email ?? '')) {
			await supabase.auth.signOut();
			throw redirect(303, '/dojo?error=not_allowed');
		}
	}

	return resolve(event);
};
