/**
 * POST /api/headless — Headless agent execution.
 *
 * Runs an agent task without human interaction (no SSE streaming).
 * The agent executes its full tool loop and returns results when done.
 *
 * Intended for:
 * - n8n cron triggers (nightly builds, weekly audits)
 * - Scheduled agent tasks
 * - Programmatic agent invocation
 *
 * Body: {
 *   agent: string,          // agent ID (flux, doc, qae, etc.)
 *   task: string,           // task description / prompt
 *   conversationId?: string // optional — link to existing conversation
 * }
 *
 * Returns: {
 *   ok: boolean,
 *   agent: string,
 *   response: string,       // final agent text
 *   toolCalls: array,       // tools the agent called
 *   prOpened?: object,      // if agent opened a PR
 *   conversationId: string
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAgent, OPENROUTER_MODEL } from '$lib/server/agents/registry';
import { buildAgentPrompt } from '$lib/server/agents/memory';
import { TaskContext, executeTool, getToolsForAgent } from '$lib/server/tools';
import { getSupabase } from '$lib/server/supabase';
import { reviewPr, postPrComment, persistSamFeedback } from '$lib/server/sam';
import { env } from '$env/dynamic/private';

interface ChatMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
}

interface ToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

const MAX_ITERATIONS = 15;

export const POST: RequestHandler = async ({ request }) => {
	const apiKey = env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return json({ ok: false, error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });
	}

	const body = await request.json();
	const { agent: agentId, task, conversationId } = body as {
		agent: string;
		task: string;
		conversationId?: string;
	};

	if (!agentId || !task) {
		return json({ ok: false, error: 'agent and task are required' }, { status: 400 });
	}

	const agentConfig = getAgent(agentId);
	if (!agentConfig) {
		return json({ ok: false, error: `Unknown agent: ${agentId}` }, { status: 400 });
	}

	const supabase = getSupabase();
	const agentTools = getToolsForAgent(agentId);

	// Create or use conversation
	let convId = conversationId;
	if (!convId) {
		const { data } = await supabase
			.from('conversations')
			.insert({ title: `[headless] ${task.slice(0, 80)}` })
			.select('id')
			.single();
		convId = data?.id;
	}

	// Build memory-enhanced prompt
	const systemPrompt = await buildAgentPrompt(agentConfig, task);

	// Task context
	const slug = task
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.trim()
		.split(/\s+/)
		.slice(0, 4)
		.join('-') || 'headless-task';
	const ctx = new TaskContext(slug, agentId);

	const history: ChatMessage[] = [{ role: 'user', content: task }];

	// Persist user message
	if (convId) {
		await supabase.from('messages').insert({
			conversation_id: convId,
			role: 'user',
			content: task
		});
	}

	const allToolCalls: Array<{ tool: string; args: unknown; result: string }> = [];
	let finalResponse = '';

	try {
		for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
			const messages: ChatMessage[] = [
				{ role: 'system', content: systemPrompt },
				...history
			];

			const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'https://rbos-portal.vercel.app',
					'X-Title': 'RBOS Portal - Headless'
				},
				body: JSON.stringify({
					model: OPENROUTER_MODEL,
					messages,
					tools: agentTools.length > 0 ? agentTools : undefined,
					stream: false,
					max_tokens: 8192
				})
			});

			if (!res.ok) {
				const errText = await res.text();
				return json({ ok: false, error: `OpenRouter ${res.status}: ${errText}` }, { status: 502 });
			}

			const data = await res.json();
			const choice = data.choices?.[0];
			if (!choice) break;

			const msg = choice.message;
			const content = msg.content ?? '';
			const toolCalls: ToolCall[] = msg.tool_calls ?? [];

			// Add to history
			const assistantMsg: ChatMessage = { role: 'assistant', content: content || null };
			if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
			history.push(assistantMsg);

			// Persist
			if (convId) {
				await supabase.from('messages').insert({
					conversation_id: convId,
					role: 'assistant',
					content: content || null,
					tool_calls: toolCalls.length > 0 ? toolCalls : null,
					agent: agentConfig.name
				});
			}

			if (toolCalls.length === 0) {
				finalResponse = content;
				break;
			}

			// Execute tools
			for (const tc of toolCalls) {
				const result = await executeTool(
					{ name: tc.function.name, arguments: tc.function.arguments },
					ctx
				);

				let parsedArgs: unknown;
				try { parsedArgs = JSON.parse(tc.function.arguments); } catch { parsedArgs = tc.function.arguments; }
				allToolCalls.push({ tool: tc.function.name, args: parsedArgs, result: result.content });

				history.push({ role: 'tool', tool_call_id: tc.id, content: result.content });

				if (convId) {
					await supabase.from('messages').insert({
						conversation_id: convId,
						role: 'tool',
						content: result.content,
						tool_call_id: tc.id
					});
				}
			}
		}

		// SAM review if PR was opened
		let samReview = null;
		if (ctx.prResult) {
			try {
				const { verdict, review } = await reviewPr(ctx.prResult.number, ctx.prResult.title);
				await postPrComment(ctx.prResult.number, review, verdict);
				await persistSamFeedback(agentId, ctx.prResult.number, verdict, review);
				samReview = { verdict, prNumber: ctx.prResult.number };

				if (convId) {
					await supabase.from('messages').insert({
						conversation_id: convId,
						role: 'assistant',
						content: review,
						agent: 'SAM'
					});
				}
			} catch (err) {
				console.error('[headless] SAM review failed:', err);
			}
		}

		return json({
			ok: true,
			agent: agentConfig.name,
			response: finalResponse,
			toolCalls: allToolCalls,
			prOpened: ctx.prResult ?? undefined,
			samReview,
			conversationId: convId
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Headless execution failed';
		return json({ ok: false, error: msg }, { status: 500 });
	}
};
