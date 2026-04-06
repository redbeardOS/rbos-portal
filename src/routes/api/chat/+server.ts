/**
 * POST /api/chat — Agentic chat endpoint for FLUX.
 *
 * Implements the full agentic loop:
 *   1. Send user message + history + tools to Claude via OpenRouter
 *   2. Stream tokens to the client as SSE
 *   3. If Claude returns tool_calls, execute them (with deny-list filter)
 *   4. Send tool results back to Claude and repeat from step 2
 *   5. When Claude responds with pure text (no tool_calls), emit done
 *
 * SSE events: status, token, tool_call, tool_result, pr_opened, done, error
 */

import { FLUX_SYSTEM_PROMPT, OPENROUTER_MODEL } from '$lib/server/flux-prompt';
import { TOOL_DEFINITIONS, TaskContext, executeTool } from '$lib/server/tools';
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

// In-memory conversation store (Sprint 1 — replaced by Supabase in Sprint 2)
const conversations = new Map<string, ChatMessage[]>();

// Max tool-use iterations to prevent infinite loops
const MAX_ITERATIONS = 15;

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

	// Create a task context — derive slug from first few words of the message
	const slug = message
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.trim()
		.split(/\s+/)
		.slice(0, 4)
		.join('-')
		|| 'task';
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
				let iteration = 0;
				let fullAssistantContent = '';

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

					// Call OpenRouter with streaming
					const upstream = await fetch(
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
								max_tokens: 4096
							})
						}
					);

					if (!upstream.ok) {
						const errText = await upstream.text();
						console.error('OpenRouter error:', upstream.status, errText);
						emit('error', {
							message: `OpenRouter returned ${upstream.status}`
						});
						break;
					}

					const reader = upstream.body?.getReader();
					if (!reader) {
						emit('error', { message: 'No response body from upstream' });
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
									emit('token', { content: delta.content });
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
										if (tc.function?.name) entry.name = tc.function.name;
										if (tc.function?.arguments) {
											entry.arguments += tc.function.arguments;
										}
									}
								}
							} catch {
								// Skip malformed chunks
							}
						}
					}

					// Convert accumulated tool calls to array
					const toolCalls: ToolCall[] = Array.from(toolCallsMap.values())
						.filter((tc) => tc.id && tc.name)
						.map((tc) => ({
							id: tc.id,
							type: 'function' as const,
							function: { name: tc.name, arguments: tc.arguments }
						}));

					// Store assistant message in history
					const assistantMsg: ChatMessage = {
						role: 'assistant',
						content: assistantContent || null
					};
					if (toolCalls.length > 0) {
						assistantMsg.tool_calls = toolCalls;
					}
					history.push(assistantMsg);

					fullAssistantContent += assistantContent;

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
						}

						// Add tool result to history
						history.push({
							role: 'tool',
							tool_call_id: tc.id,
							content: result.content
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
			} catch (err) {
				const errMsg =
					err instanceof Error ? err.message : 'Stream error';
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
			Connection: 'keep-alive'
		}
	});
};
