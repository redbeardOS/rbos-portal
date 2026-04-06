/**
 * SAM — The Critic
 *
 * Reviews FLUX's PRs by reading the diff and providing structured feedback.
 * Called automatically after FLUX opens a PR.
 */

import { SAM_SYSTEM_PROMPT, OPENROUTER_MODEL } from './flux-prompt';
import { env } from '$env/dynamic/private';

interface SamReviewResult {
	verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
	review: string;
}

/**
 * Fetch the diff for a PR from GitHub.
 */
async function getPrDiff(prNumber: number): Promise<string> {
	const token = env.GITHUB_TOKEN;
	const res = await fetch(
		`https://api.github.com/repos/redbeardOS/rbos-portal/pulls/${prNumber}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github.v3.diff',
				'User-Agent': 'rbos-portal'
			}
		}
	);
	if (!res.ok) {
		throw new Error(`Failed to fetch PR diff: ${res.status}`);
	}
	return res.text();
}

/**
 * Run SAM's review on a PR diff.
 * Returns the full review text and parsed verdict.
 * Streams tokens via the provided callback.
 */
export async function reviewPr(
	prNumber: number,
	prTitle: string,
	onToken?: (token: string) => void
): Promise<SamReviewResult> {
	const diff = await getPrDiff(prNumber);

	// Truncate very large diffs to avoid token limits
	const maxDiffChars = 30000;
	const truncatedDiff =
		diff.length > maxDiffChars
			? diff.slice(0, maxDiffChars) +
				'\n\n... [diff truncated — review the full diff on GitHub]'
			: diff;

	const apiKey = env.OPENROUTER_API_KEY;
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://rbos-portal.vercel.app',
			'X-Title': 'RBOS Portal - SAM Review'
		},
		body: JSON.stringify({
			model: OPENROUTER_MODEL,
			messages: [
				{ role: 'system', content: SAM_SYSTEM_PROMPT },
				{
					role: 'user',
					content: `Review this pull request.\n\n**PR #${prNumber}: ${prTitle}**\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
				}
			],
			stream: true,
			max_tokens: 2048
		})
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`OpenRouter error for SAM: ${res.status} — ${errText}`);
	}

	const reader = res.body?.getReader();
	if (!reader) throw new Error('No response body from SAM review');

	const decoder = new TextDecoder();
	let buffer = '';
	let reviewText = '';

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
				const content = parsed.choices?.[0]?.delta?.content;
				if (content) {
					reviewText += content;
					onToken?.(content);
				}
			} catch {
				// skip malformed chunks
			}
		}
	}

	// Parse verdict from review text
	let verdict: SamReviewResult['verdict'] = 'COMMENT';
	if (reviewText.includes('Verdict: APPROVE') || reviewText.includes('### APPROVE')) {
		verdict = 'APPROVE';
	} else if (
		reviewText.includes('Verdict: REQUEST_CHANGES') ||
		reviewText.includes('### REQUEST_CHANGES')
	) {
		verdict = 'REQUEST_CHANGES';
	}

	return { verdict, review: reviewText };
}

/**
 * Post SAM's review as a PR comment on GitHub.
 */
export async function postPrComment(
	prNumber: number,
	review: string,
	verdict: string
): Promise<void> {
	const token = env.GITHUB_TOKEN;
	const prefix =
		verdict === 'APPROVE'
			? '✅ **SAM Review — APPROVED**\n\n'
			: verdict === 'REQUEST_CHANGES'
				? '⚠️ **SAM Review — CHANGES REQUESTED**\n\n'
				: '💬 **SAM Review**\n\n';

	await fetch(
		`https://api.github.com/repos/redbeardOS/rbos-portal/issues/${prNumber}/comments`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': 'rbos-portal'
			},
			body: JSON.stringify({ body: prefix + review })
		}
	);
}
