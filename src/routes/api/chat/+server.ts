/**
 * POST /api/chat — Agentic chat endpoint for FLUX.
 *
 * Implements the full agentic loop:
 *   1. Send user message + history + tools to Claude via OpenRouter
 *   2. Stream tokens to the client as SSE
 *   3. If Claude returns tool_calls, execute them (with deny-list filter)
 *   4. Send tool results back to Claude and repeat from step 2
 *   5. When Claude responds with pure text (no tool_calls), emit done
 *   6. If FLUX opened a PR, trigger SAM review
 *
 * SSE events: conversation, status, token, tool_call, tool_result,
 *             pr_opened, agent_start, sam_token, sam_done, sam_error, done, error
 */

import { FLUX_SYSTEM_PROMPT, OPENROUTER_MODEL } from '$lib/server/flux-prompt';
import { TOOL_DEFINITIONS, TaskContext, executeTool } from '$lib/server/tools';
import { getSupabase } from '$lib/server/supabase';
import { reviewPr, postPrComment } from '$lib/server/sam';
import { sendPushToUser } from '$lib/server/push-notify';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface ChatMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

interface StreamDelta {
	content?: string | null;
	tool_calls?: Array<{
		index: number;
		id?: string;
		type?: string;
		function?: {
			name?: string;
			arguments?: string;
		};
	}>;
}

// Max tool-use iterations to prevent infinite loops
const MAX_ITERATIONS = 15;

// Per-iteration timeout (60 seconds)
const ITERATION_TIMEOUT = 60_000;

/**
 * Fetch with retry for transient failures (429, 502, 503, 504).
 * Exponential backoff: 1s, 2s, 4s.
 */
async function fetchWithRetry(
	url: string,
	init: RequestInit,
	maxRetries = 3
): Promise<Response> {
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		const res = await fetch(url, init);
		if (res.ok || attempt === maxRetries) return res;

		const status = res.status;
		// Only retry on transient errors
		if (![429, 502, 503, 504].includes(status)) return res;

		// Wait with exponential backoff
		const delay = Math.pow(2, attempt) * 1000;
		await new Promise((r) => setTimeout(r, delay));
	}
	// Unreachable, but TypeScript wants it
	throw new Error('fetchWithRetry: exhausted retries');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.session?.user?.id;
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const body = await request.json();
	const { message, conversationId } = body as {
		message: string;
		conversationId?: string;
	};

	if (!message?.trim()) {
		return new Response(
			JSON.stringify({ error: 'Message is required' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const supabase = getSupabase();

	// Get or create conversation
	let convId = conversationId;
	if (!convId) {
		const { data, error: insertErr } = await supabase
			.from('conversations')
			.insert({ title: message.slice(0, 100) })
			.select('id')
			.single();
		if (insertErr || !data) {
			return new Response(
				JSON.stringify({ error: 'Failed to create conversation' }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}
		convId = data.id;
	}

	// Load conversation history from DB
	const { data: rows } = await supabase
		.from('messages')
		.select('role, content, tool_calls, tool_call_id')
		.eq('conversation_id', convId)
		.order('created_at', { ascending: true });

	const history: ChatMessage[] = (rows ?? []).map(
		(r: {
			role: string;
			content: string | null;
			tool_calls: ToolCall[] | null;
			tool_call_id: string | null;
		}) => ({
			role: r.role as ChatMessage['role'],
			content: r.content,
			tool_calls: r.tool_calls ?? undefined,
			tool_call_id: r.tool_call_id ?? undefined
		})
	);

	// Add user message to history and persist
	history.push({ role: 'user', content: message });
	await supabase.from('messages').insert({
		conversation_id: convId,
		role: 'user',
		content: message
	});

	// Create a task context — derive slug from first few words of the message
	const slug =
		message
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.trim()
			.split(/\s+/)
			.slice(0, 4)
			.join('-') || 'task';
	const ctx = new TaskContext(slug);

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: string, data: unknown) => {
				controller.enqueue(
					encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
				);
			};

			try {
				// Emit conversation ID so frontend can track it
				emit('conversation', { id: convId });

				let iteration = 0;

				while (iteration < MAX_ITERATIONS) {
					iteration++;

					// Build messages for this API call
					const messages: ChatMessage[] = [
						{ role: 'system', content: FLUX_SYSTEM_PROMPT },
						...history
					];

					emit('status', {
						phase: iteration === 1 ? 'thinking' : 'coding'
					});

					// Set up abort controller for timeout
					const abortController = new AbortController();
					const timeout = setTimeout(
						() => abortController.abort(),
						ITERATION_TIMEOUT
					);

					let upstream: Response;
					try {
						upstream = await fetchWithRetry(
							'https://openrouter.ai/api/v1/chat/completions',
							{
								method: 'POST',
								headers: {
									Authorization: `Bearer ${apiKey}`,
									'Content-Type': 'application/json',
									'HTTP-Referer': 'https://rbos-portal.vercel.app',
									'X-Title': 'RBOS Portal - Dojo'
								},
								body: JSON.stringify({
									model: OPENROUTER_MODEL,
									messages,
									tools: TOOL_DEFINITIONS,
									stream: true,
									max_tokens: 8192
								}),
								signal: abortController.signal
							}
						);
					} catch (err) {
						clearTimeout(timeout);
						if (
							err instanceof DOMException &&
							err.name === 'AbortError'
						) {
							emit('error', {
								message:
									'Request timed out. Try a simpler task or try again.'
							});
						} else {
							const errMsg =
								err instanceof Error
									? err.message
									: 'Fetch error';
							emit('error', { message: errMsg });
						}
						break;
					}

					if (!upstream.ok) {
						clearTimeout(timeout);
						const errText = await upstream.text();
						console.error(
							'OpenRouter error:',
							upstream.status,
							errText
						);
						emit('error', {
							message: `OpenRouter returned ${upstream.status}`
						});
						break;
					}

					const reader = upstream.body?.getReader();
					if (!reader) {
						clearTimeout(timeout);
						emit('error', {
							message: 'No response body from upstream'
						});
						break;
					}

					// Accumulate the full response (text + tool calls)
					const decoder = new TextDecoder();
					let buffer = '';
					let assistantContent = '';
					const toolCallsMap = new Map<
						number,
						{ id: string; name: string; arguments: string }
					>();

					// Read the stream
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() ?? '';

						for (const line of lines) {
							if (!line.startsWith('data: ')) continue;
							const data = line.slice(6).trim();
							if (data === '[DONE]') continue;

							try {
								const parsed = JSON.parse(data);
								const delta: StreamDelta =
									parsed.choices?.[0]?.delta ?? {};

								// Accumulate text content
								if (delta.content) {
									assistantContent += delta.content;
									emit('token', {
										content: delta.content
									});
								}

								// Accumulate tool calls
								if (delta.tool_calls) {
									for (const tc of delta.tool_calls) {
										const idx = tc.index;
										if (!toolCallsMap.has(idx)) {
											toolCallsMap.set(idx, {
												id: tc.id ?? '',
												name: tc.function?.name ?? '',
												arguments: ''
											});
										}
										const entry = toolCallsMap.get(idx)!;
										if (tc.id) entry.id = tc.id;
										if (tc.function?.name)
											entry.name = tc.function.name;
										if (tc.function?.arguments) {
											entry.arguments +=
												tc.function.arguments;
										}
									}
								}
							} catch {
								// Skip malformed chunks
							}
						}
					}

					clearTimeout(timeout);

					// Convert accumulated tool calls to array
					const toolCalls: ToolCall[] = Array.from(
						toolCallsMap.values()
					)
						.filter((tc) => tc.id && tc.name)
						.map((tc) => ({
							id: tc.id,
							type: 'function' as const,
							function: {
								name: tc.name,
								arguments: tc.arguments
							}
						}));

					// Store assistant message in history and persist
					const assistantMsg: ChatMessage = {
						role: 'assistant',
						content: assistantContent || null
					};
					if (toolCalls.length > 0) {
						assistantMsg.tool_calls = toolCalls;
					}
					history.push(assistantMsg);

					await supabase.from('messages').insert({
						conversation_id: convId,
						role: 'assistant',
						content: assistantContent || null,
						tool_calls:
							toolCalls.length > 0 ? toolCalls : null,
						agent: 'FLUX'
					});

					// If no tool calls, we're done
					if (toolCalls.length === 0) {
						emit('done', {});
						break;
					}

					// Execute tool calls
					emit('status', { phase: 'coding' });

					for (const tc of toolCalls) {
						emit('tool_call', {
							id: tc.id,
							tool: tc.function.name,
							args: (() => {
								try {
									return JSON.parse(tc.function.arguments);
								} catch {
									return tc.function.arguments;
								}
							})()
						});

						const result = await executeTool(
							{
								name: tc.function.name,
								arguments: tc.function.arguments
							},
							ctx
						);

						emit('tool_result', {
							id: tc.id,
							tool: tc.function.name,
							result: result.content,
							denied: result.denied ?? false
						});

						if (result.prOpened) {
							emit('pr_opened', {
								url: result.prOpened.url,
								number: result.prOpened.number
							});

							// Push notification (fire-and-forget)
							if (userId) {
								sendPushToUser(userId, {
									title: 'FLUX opened a PR',
									body: `PR #${result.prOpened.number} is ready for review`,
									url: `/dojo/chat?c=${convId}`,
									tag: `pr-${result.prOpened.number}`
								}).catch(() => {});
							}
						}

						// Add tool result to history and persist
						history.push({
							role: 'tool',
							tool_call_id: tc.id,
							content: result.content
						});

						await supabase.from('messages').insert({
							conversation_id: convId,
							role: 'tool',
							content: result.content,
							tool_call_id: tc.id
						});
					}

					// If we just opened a PR, emit committing status
					if (ctx.prResult) {
						emit('status', { phase: 'committing' });
					}

					// Loop continues — Claude will see tool results and respond
				}

				if (iteration >= MAX_ITERATIONS) {
					emit('error', {
						message: 'Agent reached maximum tool-use iterations'
					});
				}

				// ── SAM Review ──────────────────────────────────
				if (ctx.prResult) {
					emit('status', { phase: 'reviewing' });
					emit('agent_start', { agent: 'SAM' });

					try {
						const { verdict, review } = await reviewPr(
							ctx.prResult.number,
							ctx.prResult.title,
							(token) => emit('sam_token', { content: token })
						);

						emit('sam_done', { verdict });

						// Push notification for SAM review (fire-and-forget)
						if (userId && ctx.prResult) {
							sendPushToUser(userId, {
								title:
									verdict === 'APPROVE'
										? '✅ SAM approved the PR'
										: verdict === 'REQUEST_CHANGES'
											? '⚠️ SAM requested changes'
											: '💬 SAM reviewed the PR',
								body: `PR #${ctx.prResult.number} — ${verdict.toLowerCase().replace('_', ' ')}`,
								url: `/dojo/chat?c=${convId}`,
								tag: `sam-${ctx.prResult.number}`
							}).catch(() => {});
						}

						// Post as PR comment on GitHub
						await postPrComment(
							ctx.prResult.number,
							review,
							verdict
						);

						// Persist SAM's review
						await supabase.from('messages').insert({
							conversation_id: convId,
							role: 'assistant',
							content: review,
							agent: 'SAM'
						});
					} catch (err) {
						const msg =
							err instanceof Error
								? err.message
								: 'SAM review failed';
						emit('sam_error', { message: msg });
					}
				}
			} catch (err) {
				if (
					err instanceof DOMException &&
					err.name === 'AbortError'
				) {
					controller.enqueue(
						encoder.encode(
							`event: error\ndata: ${JSON.stringify({ message: 'Request timed out. Try a simpler task or try again.' })}\n\n`
						)
					);
				} else {
					const errMsg =
						err instanceof Error ? err.message : 'Stream error';
					controller.enqueue(
						encoder.encode(
							`event: error\ndata: ${JSON.stringify({ message: errMsg })}\n\n`
						)
					);
				}
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

