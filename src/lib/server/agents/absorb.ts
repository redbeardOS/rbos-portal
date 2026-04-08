/**
 * Absorb Loop — Self-Improvement Engine
 *
 * Processes unabsorbed feedback from SAM and Alex,
 * extracts patterns, updates agent memories, and promotes
 * high-confidence patterns to reusable skills.
 *
 * This runs periodically (daily via n8n or manually via /api/absorb).
 */

import { getSupabase } from '../supabase';
import type { MemoryEntry, FeedbackEntry } from './memory';

// ── Types ────────────────────────────────────────────────────

export interface AbsorbResult {
	agentId: string;
	processed: number;
	memoriesCreated: number;
	memoriesUpdated: number;
	skillsPromoted: number;
	memoriesDecayed: number;
}

// ── Absorb Feedback ──────────────────────────────────────────

/**
 * Process unabsorbed feedback for a single agent.
 * Converts SAM/Alex feedback into memory entries.
 */
export async function absorbFeedback(agentId: string): Promise<AbsorbResult> {
	const supabase = getSupabase();
	const result: AbsorbResult = {
		agentId,
		processed: 0,
		memoriesCreated: 0,
		memoriesUpdated: 0,
		skillsPromoted: 0,
		memoriesDecayed: 0
	};

	// Fetch unabsorbed feedback
	const { data: feedback } = await supabase
		.from('agent_feedback')
		.select('*')
		.eq('agent_id', agentId)
		.eq('applied', false)
		.order('created_at', { ascending: true })
		.limit(50);

	if (!feedback?.length) return result;

	for (const item of feedback as FeedbackEntry[]) {
		result.processed++;

		// Derive a memory key from the feedback content (first 60 chars, slugified)
		const memKey = deriveMemoryKey(item.content);
		const source = item.pr_number ? `PR #${item.pr_number} (${item.source_agent})` : item.source_agent;

		// Check if a related memory already exists
		const { data: existing } = await supabase
			.from('agent_memory')
			.select('id, confidence, category')
			.eq('agent_id', agentId)
			.eq('key', memKey)
			.single();

		switch (item.feedback_type) {
			case 'approve': {
				if (existing) {
					// Reinforce existing memory
					const newConf = Math.min(1.0, existing.confidence + 0.15);
					await supabase
						.from('agent_memory')
						.update({ confidence: newConf, source })
						.eq('id', existing.id);
					result.memoriesUpdated++;
				}
				// Approvals without existing memory don't create new ones —
				// they reinforce what's already learned
				break;
			}

			case 'anti_pattern': {
				if (existing) {
					// Correct the memory — reset confidence and update value
					await supabase
						.from('agent_memory')
						.update({
							value: JSON.stringify(item.content),
							confidence: 0.5,
							category: 'warning',
							source
						})
						.eq('id', existing.id);
					result.memoriesUpdated++;
				} else {
					// New warning memory
					await supabase.from('agent_memory').insert({
						agent_id: agentId,
						category: 'warning',
						key: memKey,
						value: JSON.stringify(item.content),
						confidence: 0.4,
						source
					});
					result.memoriesCreated++;
				}
				break;
			}

			case 'pattern': {
				if (existing) {
					// Reinforce pattern
					const newConf = Math.min(1.0, existing.confidence + 0.1);
					await supabase
						.from('agent_memory')
						.update({ confidence: newConf, source })
						.eq('id', existing.id);
					result.memoriesUpdated++;
				} else {
					// New pattern memory
					await supabase.from('agent_memory').insert({
						agent_id: agentId,
						category: 'pattern',
						key: memKey,
						value: JSON.stringify(item.content),
						confidence: 0.3,
						source
					});
					result.memoriesCreated++;
				}
				break;
			}

			case 'request_changes': {
				// Store as warning
				if (existing) {
					await supabase
						.from('agent_memory')
						.update({
							value: JSON.stringify(item.content),
							confidence: Math.min(1.0, existing.confidence + 0.1),
							category: 'warning',
							source
						})
						.eq('id', existing.id);
					result.memoriesUpdated++;
				} else {
					await supabase.from('agent_memory').insert({
						agent_id: agentId,
						category: 'warning',
						key: memKey,
						value: JSON.stringify(item.content),
						confidence: 0.4,
						source
					});
					result.memoriesCreated++;
				}
				break;
			}
		}

		// Mark feedback as applied
		await supabase
			.from('agent_feedback')
			.update({ applied: true })
			.eq('id', item.id);
	}

	return result;
}

// ── Skill Promotion ──────────────────────────────────────────

/**
 * Promote high-confidence patterns to reusable skills.
 * Patterns with confidence >= 0.7 become agent skills.
 */
export async function promoteSkills(agentId: string): Promise<number> {
	const supabase = getSupabase();
	let promoted = 0;

	// Find high-confidence patterns that aren't already skills
	const { data: candidates } = await supabase
		.from('agent_memory')
		.select('*')
		.eq('agent_id', agentId)
		.eq('category', 'pattern')
		.gte('confidence', 0.7)
		.order('confidence', { ascending: false })
		.limit(10);

	if (!candidates?.length) return 0;

	for (const mem of candidates as MemoryEntry[]) {
		// Check if skill already exists
		const skillName = `learned-${mem.key}`;
		const { data: existing } = await supabase
			.from('agent_skills')
			.select('id')
			.eq('agent_id', agentId)
			.eq('skill_name', skillName)
			.single();

		if (existing) {
			// Update existing skill's success rate
			await supabase
				.from('agent_skills')
				.update({ success_rate: mem.confidence })
				.eq('id', existing.id);
			continue;
		}

		// Create new skill
		const val = typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value);
		await supabase.from('agent_skills').insert({
			agent_id: agentId,
			skill_name: skillName,
			description: `Learned pattern: ${mem.key}`,
			instruction_text: `Apply this learned pattern: ${val}`,
			trigger_pattern: mem.key,
			success_rate: mem.confidence
		});
		promoted++;
	}

	return promoted;
}

// ── Memory Decay ─────────────────────────────────────────────

/**
 * Decay stale memories. Reduces confidence for memories not updated
 * in the last 30 days. Deletes memories below 0.1 confidence.
 */
export async function decayMemories(): Promise<number> {
	const supabase = getSupabase();
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

	// Decay confidence by 0.05 for stale memories
	const { data: stale } = await supabase
		.from('agent_memory')
		.select('id, confidence')
		.lt('updated_at', thirtyDaysAgo);

	if (!stale?.length) return 0;

	let affected = 0;
	for (const mem of stale) {
		const newConf = mem.confidence - 0.05;
		if (newConf < 0.1) {
			await supabase.from('agent_memory').delete().eq('id', mem.id);
		} else {
			await supabase
				.from('agent_memory')
				.update({ confidence: newConf })
				.eq('id', mem.id);
		}
		affected++;
	}

	return affected;
}

// ── Full Absorb Run ──────────────────────────────────────────

/**
 * Run the full absorb cycle for one or all agents.
 */
export async function runAbsorbCycle(agentId?: string): Promise<AbsorbResult[]> {
	const supabase = getSupabase();
	const results: AbsorbResult[] = [];

	// Determine which agents to process
	let agentIds: string[];
	if (agentId) {
		agentIds = [agentId];
	} else {
		const { data: agents } = await supabase
			.from('agent_feedback')
			.select('agent_id')
			.eq('applied', false);
		agentIds = [...new Set((agents ?? []).map((a: { agent_id: string }) => a.agent_id))];
	}

	for (const id of agentIds) {
		const absorbResult = await absorbFeedback(id);
		absorbResult.skillsPromoted = await promoteSkills(id);
		absorbResult.memoriesDecayed = await decayMemories();
		results.push(absorbResult);
	}

	return results;
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Derive a memory key from feedback content.
 * Takes the first ~60 chars and slugifies them.
 */
function deriveMemoryKey(content: string): string {
	return content
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.split(/\s+/)
		.slice(0, 6)
		.join('-')
		.slice(0, 60) || 'unnamed-pattern';
}
