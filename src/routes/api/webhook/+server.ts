/**
 * POST /api/webhook — GitHub webhook handler.
 *
 * Listens for pull_request events (merged/closed) to capture
 * Alex's merge/reject signals as feedback for the self-improvement loop.
 *
 * Setup: In GitHub repo settings → Webhooks, add:
 *   URL: https://rbos-portal.vercel.app/api/webhook
 *   Content type: application/json
 *   Secret: (set GITHUB_WEBHOOK_SECRET env var)
 *   Events: Pull requests
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordFeedback, boostMemoryConfidence } from '$lib/server/agents/memory';
import { AGENTS } from '$lib/server/agents/registry';
import { getSupabase } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify GitHub webhook signature (HMAC-SHA256).
 */
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
	if (!signature) return false;
	const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
	try {
		return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
	} catch {
		return false;
	}
}

/**
 * Extract the agent ID from a branch name using the registry's branch prefixes.
 * e.g., "flux/add-health-endpoint" → "flux"
 *       "doc/onboarding-spec" → "doc"
 */
function agentIdFromBranch(branch: string): string | null {
	for (const [id, config] of AGENTS) {
		if (config.branchPrefix && branch.startsWith(config.branchPrefix)) {
			return id;
		}
	}
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.GITHUB_WEBHOOK_SECRET;
	const rawBody = await request.text();

	// Verify signature — reject unsigned requests in production
	if (secret) {
		const sig = request.headers.get('x-hub-signature-256');
		if (!verifySignature(rawBody, sig, secret)) {
			console.warn('[webhook] Invalid signature — rejecting');
			return json({ error: 'Invalid signature' }, { status: 401 });
		}
	} else {
		console.warn('[webhook] GITHUB_WEBHOOK_SECRET not set — accepting unsigned request');
	}

	const event = request.headers.get('x-github-event');
	if (event !== 'pull_request') {
		return json({ ok: true, skipped: true, reason: `Event ${event} not handled` });
	}

	let payload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const action = payload.action;
	const pr = payload.pull_request;
	if (!pr) return json({ ok: true, skipped: true });

	const prNumber = pr.number;
	const branch = pr.head?.ref ?? '';
	const agentId = agentIdFromBranch(branch);

	if (!agentId) {
		// PR not from an agent branch — ignore
		return json({ ok: true, skipped: true, reason: 'Not an agent branch' });
	}

	const mergedBy = pr.merged_by?.login ?? 'unknown';

	if (action === 'closed' && pr.merged) {
		// PR was MERGED by Alex — strongest positive signal
		console.log(`[webhook] PR #${prNumber} merged by ${mergedBy} for agent ${agentId}`);

		await recordFeedback(
			agentId,
			'alex',
			prNumber,
			'approve',
			`PR #${prNumber} merged by ${mergedBy}. Branch: ${branch}. Title: ${pr.title}`
		);

		// Boost confidence of any memories tagged with this PR
		const supabase = getSupabase();
		const { data: related } = await supabase
			.from('agent_feedback')
			.select('content')
			.eq('agent_id', agentId)
			.eq('pr_number', prNumber)
			.eq('feedback_type', 'approve')
			.eq('source_agent', 'sam');

		if (related?.length) {
			// SAM approved and Alex merged — double reinforcement
			// Boost any memories that were used in this session
			const { data: memories } = await supabase
				.from('agent_memory')
				.select('key')
				.eq('agent_id', agentId)
				.gte('confidence', 0.3);

			for (const mem of memories ?? []) {
				await boostMemoryConfidence(agentId, mem.key, 0.05);
			}
		}

		return json({ ok: true, action: 'merge_recorded', agent: agentId, pr: prNumber });
	}

	if (action === 'closed' && !pr.merged) {
		// PR was CLOSED without merge — rejection signal
		console.log(`[webhook] PR #${prNumber} rejected (closed without merge) for agent ${agentId}`);

		await recordFeedback(
			agentId,
			'alex',
			prNumber,
			'request_changes',
			`PR #${prNumber} closed without merge. Branch: ${branch}. Title: ${pr.title}. This work was rejected.`
		);

		return json({ ok: true, action: 'rejection_recorded', agent: agentId, pr: prNumber });
	}

	return json({ ok: true, skipped: true, reason: `Action ${action} not handled` });
};
