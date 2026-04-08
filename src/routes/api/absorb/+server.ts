/**
 * POST /api/absorb — Run the self-improvement absorb loop.
 *
 * Processes unabsorbed SAM/Alex feedback into agent memories and skills.
 * Intended to be called by n8n cron (daily) or manually for testing.
 *
 * Body: { agentId?: string } — if omitted, runs for all agents with pending feedback.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAbsorbCycle } from '$lib/server/agents/absorb';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const { agentId } = body as { agentId?: string };

	try {
		const results = await runAbsorbCycle(agentId);

		const summary = results.map((r) => ({
			agent: r.agentId,
			processed: r.processed,
			memoriesCreated: r.memoriesCreated,
			memoriesUpdated: r.memoriesUpdated,
			skillsPromoted: r.skillsPromoted,
			memoriesDecayed: r.memoriesDecayed
		}));

		console.log('[absorb] Cycle complete:', JSON.stringify(summary));

		return json({ ok: true, results: summary });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Absorb loop failed';
		console.error('[absorb] Error:', msg);
		return json({ ok: false, error: msg }, { status: 500 });
	}
};
