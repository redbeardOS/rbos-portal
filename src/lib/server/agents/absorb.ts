/**
 * Absorb Loop — Self-Improvement Engine
 *
 * Processes unabsorbed feedback from SAM and Alex,
 * uses Ollama (local LLM) for semantic pattern extraction,
 * updates agent memories, and promotes high-confidence patterns
 * to reusable skills.
 *
 * This runs periodically (daily via n8n or manually via /api/absorb).
 */

import { getSupabase } from '../supabase';
import { ollamaGenerate } from '../ollama';
import type { MemoryEntry, FeedbackEntry } from './memory';

// ── Types ────────────────────────────────────────────────────

export interface AbsorbResult {
	agentId: string;
	processed: number;
	memoriesCreated: number;
	memoriesUpdated: number;
	skillsPromoted: number;
	memoriesDecayed: number;
	ollamaUsed: boolean;
}

// ── Ollama Pattern Extraction ────────────────────────────────

interface ExtractedPattern {
	key: string;
	category: 'preference' | 'pattern' | 'warning';
	summary: string;
}

/**
 * Use Ollama to extract a semantic key and summary from feedback content.
 * Falls back to heuristic extraction if Ollama is unavailable.
 */
async function extractPattern(content: string, feedbackType: string): Promise<ExtractedPattern> {
	try {
		const prompt = `Extract a concise, reusable pattern from this code review feedback.

Feedback type: ${feedbackType}
Feedback: ${content.slice(0, 500)}

Respond in EXACTLY this format (3 lines, no extra text):
KEY: <lowercase-hyphenated-key-max-60-chars>
CATEGORY: <preference|pattern|warning>
SUMMARY: <one-sentence actionable rule>`;

		const response = await ollamaGenerate(prompt, {
			temperature: 0.1,
			num_predict: 150,
			system: 'You extract concise coding patterns from review feedback. Be precise and actionable.'
		});

		// Parse the structured response
		const lines = response.trim().split('\n');
		let key = '';
		let category: ExtractedPattern['category'] = 'pattern';
		let summary = '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith('KEY:')) {
				key = trimmed.slice(4).trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
			} else if (trimmed.startsWith('CATEGORY:')) {
				const cat = trimmed.slice(9).trim().toLowerCase();
				if (cat === 'preference' || cat === 'pattern' || cat === 'warning') {
					category = cat;
				}
			} else if (trimmed.startsWith('SUMMARY:')) {
				summary = trimmed.slice(8).trim();
			}
		}

		if (key && summary) {
			return { key, category, summary };
		}

		// Ollama responded but format was wrong — fall back
		return heuristicExtract(content, feedbackType);
	} catch {
		// Ollama unavailable — fall back to heuristic
		return heuristicExtract(content, feedbackType);
	}
}

/**
 * Heuristic fallback when Ollama is unavailable.
 */
function heuristicExtract(content: string, feedbackType: string): ExtractedPattern {
	const key = content
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.split(/\s+/)
		.slice(0, 6)
		.join('-')
		.slice(0, 60) || 'unnamed-pattern';

	const category: ExtractedPattern['category'] =
		feedbackType === 'anti_pattern' || feedbackType === 'request_changes'
			? 'warning'
			: feedbackType === 'approve'
				? 'preference'
				: 'pattern';

	return { key, category, summary: content.slice(0, 200) };
}

/**
 * Use Ollama to generate a skill instruction from a high-confidence memory.
 * Falls back to simple formatting if Ollama is unavailable.
 */
async function generateSkillInstruction(memKey: string, memValue: string): Promise<string> {
	try {
		const prompt = `Convert this learned pattern into a concise, actionable instruction for a code-writing AI agent.

Pattern key: ${memKey}
Pattern value: ${memValue.slice(0, 500)}

Write a 1-3 sentence instruction the agent should follow. Be specific and direct.`;

		return await ollamaGenerate(prompt, {
			temperature: 0.2,
			num_predict: 200,
			system: 'You write concise coding instructions for AI agents.'
		});
	} catch {
		return `Apply this learned pattern: ${memValue.slice(0, 300)}`;
	}
}

// ── Absorb Feedback ──────────────────────────────────────────

/**
 * Process unabsorbed feedback for a single agent.
 * Uses Ollama for semantic pattern extraction when available.
 */
export async function absorbFeedback(agentId: string): Promise<AbsorbResult> {
	const supabase = getSupabase();
	const result: AbsorbResult = {
		agentId,
		processed: 0,
		memoriesCreated: 0,
		memoriesUpdated: 0,
		skillsPromoted: 0,
		memoriesDecayed: 0,
		ollamaUsed: false
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

		// Extract pattern semantically via Ollama (falls back to heuristic)
		const pattern = await extractPattern(item.content, item.feedback_type);
		if (pattern.key !== item.content.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().split(/\s+/).slice(0, 6).join('-').slice(0, 60)) {
			result.ollamaUsed = true; // Ollama produced a different key than heuristic would
		}

		const source = item.pr_number ? `PR #${item.pr_number} (${item.source_agent})` : item.source_agent;

		// Check if a related memory already exists
		const { data: existing } = await supabase
			.from('agent_memory')
			.select('id, confidence, category')
			.eq('agent_id', agentId)
			.eq('key', pattern.key)
			.single();

		switch (item.feedback_type) {
			case 'approve': {
				if (existing) {
					const newConf = Math.min(1.0, existing.confidence + 0.15);
					await supabase
						.from('agent_memory')
						.update({ confidence: newConf, source })
						.eq('id', existing.id);
					result.memoriesUpdated++;
				}
				break;
			}

			case 'anti_pattern': {
				if (existing) {
					await supabase
						.from('agent_memory')
						.update({
							value: JSON.stringify(pattern.summary),
							confidence: 0.5,
							category: 'warning',
							source
						})
						.eq('id', existing.id);
					result.memoriesUpdated++;
				} else {
					await supabase.from('agent_memory').insert({
						agent_id: agentId,
						category: 'warning',
						key: pattern.key,
						value: JSON.stringify(pattern.summary),
						confidence: 0.4,
						source
					});
					result.memoriesCreated++;
				}
				break;
			}

			case 'pattern': {
				if (existing) {
					const newConf = Math.min(1.0, existing.confidence + 0.1);
					await supabase
						.from('agent_memory')
						.update({ confidence: newConf, source })
						.eq('id', existing.id);
					result.memoriesUpdated++;
				} else {
					await supabase.from('agent_memory').insert({
						agent_id: agentId,
						category: pattern.category,
						key: pattern.key,
						value: JSON.stringify(pattern.summary),
						confidence: 0.3,
						source
					});
					result.memoriesCreated++;
				}
				break;
			}

			case 'request_changes': {
				if (existing) {
					await supabase
						.from('agent_memory')
						.update({
							value: JSON.stringify(pattern.summary),
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
						key: pattern.key,
						value: JSON.stringify(pattern.summary),
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
 * Uses Ollama to generate actionable skill instructions.
 */
export async function promoteSkills(agentId: string): Promise<number> {
	const supabase = getSupabase();
	let promoted = 0;

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
		const skillName = `learned-${mem.key}`;
		const { data: existing } = await supabase
			.from('agent_skills')
			.select('id')
			.eq('agent_id', agentId)
			.eq('skill_name', skillName)
			.single();

		if (existing) {
			await supabase
				.from('agent_skills')
				.update({ success_rate: mem.confidence })
				.eq('id', existing.id);
			continue;
		}

		// Use Ollama to generate a proper skill instruction
		const val = typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value);
		const instruction = await generateSkillInstruction(mem.key, val);

		await supabase.from('agent_skills').insert({
			agent_id: agentId,
			skill_name: skillName,
			description: `Learned pattern: ${mem.key}`,
			instruction_text: instruction,
			trigger_pattern: mem.key,
			success_rate: mem.confidence
		});
		promoted++;
	}

	return promoted;
}

// ── Memory Decay ─────────────────────────────────────────────

/**
 * Decay stale memories for a specific agent (or all agents if no ID given).
 * Reduces confidence for memories not updated in the last 30 days.
 * Deletes memories below 0.1 confidence.
 */
export async function decayMemories(agentId?: string): Promise<number> {
	const supabase = getSupabase();
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

	let query = supabase
		.from('agent_memory')
		.select('id, confidence')
		.lt('updated_at', thirtyDaysAgo);

	if (agentId) {
		query = query.eq('agent_id', agentId);
	}

	const { data: stale } = await query;

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
		absorbResult.memoriesDecayed = await decayMemories(id);
		results.push(absorbResult);
	}

	return results;
}
