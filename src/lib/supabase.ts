import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';

export function createSupabaseBrowser() {
	return createBrowserClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!);
}
