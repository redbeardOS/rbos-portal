/**
 * Ollama Client — Local Inference for Routine Tasks
 *
 * Routes background tasks (feedback absorption, memory extraction,
 * embeddings, classification) through the self-hosted Ollama instance
 * on srv1291263, saving OpenRouter token costs.
 *
 * Agent chat stays on OpenRouter/Claude Sonnet for quality.
 * This module handles the low-stakes, high-volume work.
 */

import { env } from '$env/dynamic/private';

// ── Types ────────────────────────────────────────────────────

export interface OllamaOptions {
	model?: string;
	temperature?: number;
	system?: string;
	num_predict?: number;
}

interface OllamaGenerateResponse {
	response: string;
	done: boolean;
	total_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

interface OllamaEmbedResponse {
	embeddings: number[][];
}

interface OllamaTagsResponse {
	models: Array<{ name: string; size: number; modified_at: string }>;
}

// ── Config ───────────────────────────────────────────────────

function getBaseUrl(): string {
	const url = env.OLLAMA_BASE_URL;
	if (!url) throw new Error('OLLAMA_BASE_URL not configured');
	return url.replace(/\/$/, '');
}

function getHeaders(): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const key = env.OLLAMA_API_KEY;
	if (key) headers['X-Ollama-Key'] = key;
	return headers;
}

const DEFAULT_TIMEOUT = 120_000; // 2 minutes — CPU inference is slow

// ── Generate (Text Completion) ───────────────────────────────

/**
 * Generate text using Ollama. Default model: llama3.1:8b.
 * Returns the generated text. Falls back to error message on failure.
 */
export async function ollamaGenerate(
	prompt: string,
	options: OllamaOptions = {}
): Promise<string> {
	const baseUrl = getBaseUrl();
	const model = options.model ?? 'llama3.1:8b';

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

	try {
		const body: Record<string, unknown> = {
			model,
			prompt,
			stream: false,
			options: {
				temperature: options.temperature ?? 0.3,
				num_predict: options.num_predict ?? 1024
			}
		};
		if (options.system) {
			body.system = options.system;
		}

		const res = await fetch(`${baseUrl}/api/generate`, {
			method: 'POST',
			headers: getHeaders(),
			body: JSON.stringify(body),
			signal: controller.signal
		});

		if (!res.ok) {
			const errText = await res.text();
			throw new Error(`Ollama generate error ${res.status}: ${errText}`);
		}

		const data = (await res.json()) as OllamaGenerateResponse;
		return data.response;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			console.warn(`[ollama] Generate timed out after ${DEFAULT_TIMEOUT}ms`);
			throw new Error('Ollama generate timed out');
		}
		throw err;
	} finally {
		clearTimeout(timeout);
	}
}

// ── Embeddings ───────────────────────────────────────────────

/**
 * Generate embeddings using BGE-M3.
 * Accepts multiple texts for batch embedding.
 */
export async function ollamaEmbed(texts: string[]): Promise<number[][]> {
	const baseUrl = getBaseUrl();

	const res = await fetch(`${baseUrl}/api/embed`, {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify({
			model: 'bge-m3',
			input: texts
		})
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Ollama embed error ${res.status}: ${errText}`);
	}

	const data = (await res.json()) as OllamaEmbedResponse;
	return data.embeddings;
}

// ── Classification ───────────────────────────────────────────

/**
 * Classify text into one of the given categories.
 * Uses a lightweight model for speed.
 */
export async function ollamaClassify(
	text: string,
	categories: string[]
): Promise<string> {
	const prompt = `Classify the following text into exactly one of these categories: ${categories.join(', ')}.

Text: ${text}

Respond with ONLY the category name, nothing else.

Category:`;

	const result = await ollamaGenerate(prompt, {
		model: 'llama3.1:8b',
		temperature: 0.1,
		num_predict: 20
	});

	// Extract the category from the response
	const cleaned = result.trim().toLowerCase();
	const match = categories.find((c) => cleaned.includes(c.toLowerCase()));
	return match ?? categories[0];
}

// ── Health Check ─────────────────────────────────────────────

/**
 * Check Ollama connectivity and loaded models.
 */
export async function ollamaHealthCheck(): Promise<{
	status: 'ok' | 'unreachable';
	models: string[];
	url: string;
}> {
	try {
		const baseUrl = getBaseUrl();
		const res = await fetch(`${baseUrl}/api/tags`, {
			headers: getHeaders(),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) {
			return { status: 'unreachable', models: [], url: baseUrl };
		}
		const data = (await res.json()) as OllamaTagsResponse;
		return {
			status: 'ok',
			models: data.models.map((m) => m.name),
			url: baseUrl
		};
	} catch {
		return { status: 'unreachable', models: [], url: env.OLLAMA_BASE_URL ?? '(not set)' };
	}
}
