/**
 * RBOS Hive Agent Registry
 *
 * Central registry for all Hive dev-team agents.
 * To add a new agent: create a config file in this directory,
 * then add it to the AGENTS map below.
 */

export interface AgentConfig {
	id: string;
	name: string;
	role: string;
	description: string;
	systemPrompt: string;
	tools: string[];
	branchPrefix: string;
	color: string;
	selectable: boolean;
}

import { FLUX_CONFIG } from './flux';
import { SAM_CONFIG } from './sam';

/**
 * Master agent registry.
 * New agents add their config import above and their entry here.
 */
export const AGENTS = new Map<string, AgentConfig>([
	['flux', FLUX_CONFIG],
	['sam', SAM_CONFIG]
]);

export function getSelectableAgents(): AgentConfig[] {
	return Array.from(AGENTS.values()).filter((a) => a.selectable);
}

export function getAgent(id: string): AgentConfig | undefined {
	return AGENTS.get(id);
}

export const DEFAULT_AGENT_ID = 'flux';

export const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4';
