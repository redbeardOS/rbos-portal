import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { createClient } from '@supabase/supabase-js';

// Initialize web-push with VAPID keys
const vapidPublicKey = env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = env.VAPID_PRIVATE_KEY;
const vapidSubject = env.VAPID_SUBJECT ?? 'mailto:alex@chisholm79.com';

if (vapidPublicKey && vapidPrivateKey) {
	webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

interface PushPayload {
	title: string;
	body: string;
	url?: string;
	tag?: string;
}

/**
 * Send a push notification to all subscriptions for a user.
 * Silently fails if VAPID keys aren't configured.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
	if (!vapidPublicKey || !vapidPrivateKey) return;

	const supabase = createClient(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '');

	const { data: subscriptions } = await supabase
		.from('push_subscriptions')
		.select('endpoint, keys_p256dh, keys_auth')
		.eq('user_id', userId);

	if (!subscriptions?.length) return;

	const payloadStr = JSON.stringify(payload);

	await Promise.allSettled(
		subscriptions.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{
						endpoint: sub.endpoint,
						keys: {
							p256dh: sub.keys_p256dh,
							auth: sub.keys_auth
						}
					},
					payloadStr
				);
			} catch (err: unknown) {
				// If subscription is expired/invalid, clean it up
				if (err && typeof err === 'object' && 'statusCode' in err) {
					const statusCode = (err as { statusCode: number }).statusCode;
					if (statusCode === 404 || statusCode === 410) {
						await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
					}
				}
			}
		})
	);
}
