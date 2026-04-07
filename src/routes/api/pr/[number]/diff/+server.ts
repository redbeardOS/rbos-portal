import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params }) => {
	const prNumber = parseInt(params.number);
	if (isNaN(prNumber)) throw error(400, 'Invalid PR number');

	const token = env.GITHUB_TOKEN;
	if (!token) throw error(500, 'GitHub token not configured');

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

	if (!res.ok) throw error(res.status, 'Failed to fetch diff');

	const diff = await res.text();
	const maxChars = 50000;
	const truncated =
		diff.length > maxChars
			? diff.slice(0, maxChars) + '\n\n... [diff truncated — view full diff on GitHub]'
			: diff;

	return new Response(truncated, { headers: { 'Content-Type': 'text/plain' } });
};
