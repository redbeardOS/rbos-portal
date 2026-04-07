/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare let self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE_NAME = `dojo-${version}`;
const PRECACHE = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	if (
		event.request.method !== 'GET' ||
		url.pathname.startsWith('/api/') ||
		url.origin.includes('supabase')
	) {
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (event.request.mode === 'navigate') {
				return fetch(event.request)
					.then((response) => {
						const clone = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
						return response;
					})
					.catch(() => cached ?? new Response('Offline', { status: 503 }));
			}

			if (cached) return cached;

			return fetch(event.request).then((response) => {
				if (
					response.ok &&
					(url.pathname.startsWith('/_app/') || url.pathname.startsWith('/icons/'))
				) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
				}
				return response;
			});
		})
	);
});
