import { FLUX_SYSTEM_PROMPT, OPENROUTER_MODEL } from '$lib/server/flux-prompt';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

// In-memory conversation store (Sprint 1 — replaced by Supabase in Sprint 2)
const conversations = new Map<string, ChatMessage[]>();

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const body = await request.json();
	const { message, conversationId = 'default' } = body as {
		message: string;
		conversationId?: string;
	};

	if (!message?.trim()) {
		return new Response(
			JSON.stringify({ error: 'Message is required' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// Get or create conversation history
	if (!conversations.has(conversationId)) {
		conversations.set(conversationId, []);
	}
	const history = conversations.get(conversationId)!;

	// Add user message to history
	history.push({ role: 'user', content: message });

	// Build messages array with system prompt
	const messages: ChatMessage[] = [
		{ role: 'system', content: FLUX_SYSTEM_PROMPT },
		...history
	];

	// Call OpenRouter (OpenAI-compatible streaming API)
	const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://rbos-portal.vercel.app',
			'X-Title': 'RBOS Portal — Dojo'
		},
		body: JSON.stringify({
			model: OPENROUTER_MODEL,
			messages,
			stream: true,
			max_tokens: 4096
		})
	});

	if (!upstream.ok) {
		const errText = await upstream.text();
		console.error('OpenRouter error:', upstream.status, errText);
		return new Response(
			JSON.stringify({ error: `OpenRouter returned ${upstream.status}` }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// Transform upstream SSE into our SSE format
	const reader = upstream.body?.getReader();
	if (!reader) {
		return new Response(
			JSON.stringify({ error: 'No response body from upstream' }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let assistantContent = '';

	const stream = new ReadableStream({
		async start(controller) {
			// Send initial status
			controller.enqueue(
				encoder.encode(`event: status\ndata: ${JSON.stringify({ phase: 'thinking' })}\n\n`)
			);

			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (!line.startsWith('data: ')) continue;
						const data = line.slice(6).trim();
						if (data === '[DONE]') {
							// Store assistant response in history
							history.push({ role: 'assistant', content: assistantContent });
							controller.enqueue(
								encoder.encode(`event: done\ndata: {}\n\n`)
							);
							continue;
						}

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta;
							if (delta?.content) {
								assistantContent += delta.content;
								controller.enqueue(
									encoder.encode(
										`event: token\ndata: ${JSON.stringify({ content: delta.content })}\n\n`
									)
								);
							}
						} catch {
							// Skip malformed chunks
						}
					}
				}
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : 'Stream error';
				controller.enqueue(
					encoder.encode(
						`event: error\ndata: ${JSON.stringify({ message: errMsg })}\n\n`
					)
				);
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
