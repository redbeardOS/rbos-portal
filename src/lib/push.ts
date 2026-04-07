import { browser } from '$app/environment';

/**
 * Request push notification permission and subscribe.
 * Returns true if subscription was successful.
 */
export async function subscribeToPush(): Promise<boolean> {
	if (!browser || !('serviceWorker' in navigator) || !('PushManager' in window)) {
		return false;
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	try {
		const registration = await navigator.serviceWorker.ready;

		// Check for existing subscription
		let subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			// Already subscribed, ensure server knows
			await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(subscription.toJSON())
			});
			return true;
		}

		// Get VAPID public key from server
		const keyRes = await fetch('/api/push/vapid-key');
		const { publicKey } = await keyRes.json();
		if (!publicKey) return false;

		// Convert VAPID key to Uint8Array
		const applicationServerKey = urlBase64ToUint8Array(publicKey);

		// Subscribe
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey
		});

		// Send subscription to server
		await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(subscription.toJSON())
		});

		return true;
	} catch (err) {
		console.error('Push subscription failed:', err);
		return false;
	}
}

/**
 * Check if push is currently subscribed.
 */
export async function isPushSubscribed(): Promise<boolean> {
	if (!browser || !('serviceWorker' in navigator)) return false;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		return subscription !== null;
	} catch {
		return false;
	}
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<void> {
	if (!browser || !('serviceWorker' in navigator)) return;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			await fetch('/api/push/subscribe', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: subscription.endpoint })
			});
			await subscription.unsubscribe();
		}
	} catch (err) {
		console.error('Push unsubscribe failed:', err);
	}
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
