/**
 * Agent Memory System — Self-Improving Agents
 *
 * Provides:
 * - buildAgentPrompt(): loads memories + skills into system prompt
 * - recordFeedback(): persists SAM/Alex feedback for the absorb loop
 * - boostMemoryConfidence(): reinforces a memory entry
 * - upsertMemory(): creates or updates an agent memory
 */

import { getSupabase } from '../supabase';
import type { AgentConfig } from './registry';

// ── Types ────────────────────────────────────────────────────

export interface MemoryEntry {
	id: string;
	agent_id: string;
	category: string;
	key: string;
	value: unknown;
	confidence: number;
	source: string | null;
	created_at: string;
	updated_at: string;
}

export interface FeedbackEntry {
	id: string;
	agent_id: string;
	source_agent: string;
	pr_number: number | null;
	feedback_type: string;
	content: string;
	applied: boolean;
	created_at: string;
}

export interface SkillEntry {
	id: string;
	agent_id: string;
	skill_name: string;
	description: string;
	instruction_text: string;
	trigger_pattern: string | null;
	usage_count: number;
	success_rate: number;
}

// ── Prompt Builder ───────────────────────────────────────────

/**
 * Build an enhanced system prompt by injecting learned memories and skills.
 * Falls back to the raw system prompt if no memories/skills exist or on error.
 */
export async function buildAgentPrompt(
	agentConfig: AgentConfig,
	taskHint?: string
): Promise<string> {
	const supabase = getSupabase();
	let prompt = agentConfig.systemPrompt;

	try {
		// Load memories with confidence >= 0.3
		const { data: memories } = await supabase
			.from('agent_memory')
			.select('*')
			.eq('agent_id', agentConfig.id)
			.gte('confidence', 0.3)
			.order('confidence', { ascending: false })
			.limit(20);

		// Load top skills by success rate
		const { data: skills } = await supabase
			.from('agent_skills')
			.select('*')
			.eq('agent_id', agentConfig.id)
			.gt('success_rate', 0.0)
			.order('success_rate', { ascending: false })
			.limit(5);

		if (memories?.length) {
			prompt += '\n\n## Learned Preferences\n\n';
			prompt +=
				'These are patterns you have learned from past work and feedback. Apply them where relevant:\n\n';
			for (const m of memories as MemoryEntry[]) {
				const conf = (m.confidence * 100).toFixed(0);
				const val =
					typeof m.value === 'string'
						? m.value
						: JSON.stringify(m.value);
				prompt += `- **${m.key}** [${m.category}, ${conf}% confidence]: ${val}\n`;
			}
		}

		if (skills?.length) {
			// If taskHint is provided, prefer skills whose trigger matches
			let relevantSkills = skills as SkillEntry[];
			if (taskHint) {
				const hint = taskHint.toLowerCase();
				const matched = relevantSkills.filter(
					(s) =>
						s.trigger_pattern &&
						hint.includes(s.trigger_pattern.toLowerCase())
				);
				if (matched.length > 0) {
					relevantSkills = matched;
				}
			}

			prompt += '\n\n## Active Skills\n\n';
			for (const s of relevantSkills) {
				prompt += `### ${s.skill_name}\n${s.instruction_text}\n\n`;
			}
		}
	} catch (err) {
		// If memory loading fails, fall back to raw prompt
		console.error('Failed to load agent memories:', err);
	}

	return prompt;
}

// ── Feedback Recording ───────────────────────────────────────

/**
 * Record feedback from SAM or Alex into agent_feedback.
 * This is consumed later by the absorb loop.
 */
export async function recordFeedback(
	agentId: string,
	sourceAgent: string,
	prNumber: number | null,
	feedbackType: 'approve' | 'request_changes' | 'pattern' | 'anti_pattern',
	content: string
): Promise<void> {
	const supabase = getSupabase();
	const { error } = await supabase.from('agent_feedback').insert({
		agent_id: agentId,
		source_agent: sourceAgent,
		pr_number: prNumber,
		feedback_type: feedbackType,
		content
	});
	if (error) {
		console.error('Failed to record feedback:', error);
	}
}

// ── Memory Operations ────────────────────────────────────────

/**
 * Boost confidence for a memory entry. Caps at 1.0.
 */
export async function boostMemoryConfidence(
	agentId: string,
	key: string,
	boost: number
): Promise<void> {
	const supabase = getSupabase();

	const { data: existing } = await supabase
		.from('agent_memory')
		.select('confidence')
		.eq('agent_id', agentId)
		.eq('key', key)
		.single();

	if (existing) {
		const newConf = Math.min(1.0, existing.confidence + boost);
		await supabase
			.from('agent_memory')
			.update({ confidence: newConf })
			.eq('agent_id', agentId)
			.eq('key', key);
	}
}

/**
 * Create or update an agent memory entry.
 * If the key exists: updates value and bumps confidence by 0.1.
 * If new: creates with the given confidence (default 0.3).
 */
export async function upsertMemory(
	agentId: string,
	category: 'preference' | 'pattern' | 'warning',
	key: string,
	value: unknown,
	source?: string
): Promise<void> {
	const supabase = getSupabase();

	const { data: existing } = await supabase
		.from('agent_memory')
		.select('id, confidence')
		.eq('agent_id', agentId)
		.eq('key', key)
		.single();

	if (existing) {
		// Update existing — bump confidence
		const newConf = Math.min(1.0, existing.confidence + 0.1);
		await supabase
			.from('agent_memory')
			.update({
				value,
				confidence: newConf,
				source: source ?? undefined
			})
			.eq('id', existing.id);
	} else {
		// Insert new
		await supabase.from('agent_memory').insert({
			agent_id: agentId,
			category,
			key,
			value,
			confidence: 0.3,
			source: source ?? null
		});
	}
}

/**
 * Read agent memories, optionally filtered by category and/or key.
 */
export async function readMemories(
	agentId: string,
	category?: string,
	key?: string
): Promise<MemoryEntry[]> {
	const supabase = getSupabase();
	let query = supabase
		.from('agent_memory')
		.select('*')
		.eq('agent_id', agentId)
		.order('confidence', { ascending: false })
		.limit(20);

	if (category) {
		query = query.eq('category', category);
	}
	if (key) {
		query = query.eq('key', key);
	}

	const { data } = await query;
	return (data as MemoryEntry[]) ?? [];
}
