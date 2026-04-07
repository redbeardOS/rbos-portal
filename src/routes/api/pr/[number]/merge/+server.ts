import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ params }) => {
	const prNumber = parseInt(params.number);
	if (isNaN(prNumber)) throw error(400, 'Invalid PR number');

	const token = env.GITHUB_TOKEN;
	if (!token) throw error(500, 'GitHub token not configured');

	const res = await fetch(
		`https://api.github.com/repos/redbeardOS/rbos-portal/pulls/${prNumber}/merge`,
		{
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				'User-Agent': 'rbos-portal'
			},
			body: JSON.stringify({ merge_method: 'squash' })
		}
	);

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw error(res.status, body.message ?? 'Merge failed');
	}

	const result = await res.json();
	return json({ sha: result.sha, merged: true });
};
