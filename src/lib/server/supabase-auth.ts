import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export function createSupabaseServer(cookies: Cookies) {
	return createServerClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});
}
