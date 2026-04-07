/**
 * Backward-compat re-exports.
 * New code should import from agents/registry.ts directly.
 */
import { getAgent, OPENROUTER_MODEL } from './agents/registry';

export { OPENROUTER_MODEL };

export const SAM_SYSTEM_PROMPT = getAgent('sam')!.systemPrompt;
export const FLUX_SYSTEM_PROMPT = getAgent('flux')!.systemPrompt;
