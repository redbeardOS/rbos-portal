import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export function getSupabase() {
	const url = env.SUPABASE_URL;
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Supabase not configured');
	return createClient(url, key);
}
