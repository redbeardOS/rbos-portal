/**
 * GitHub REST API client for FLUX agent operations.
 *
 * All git operations go through GitHub's REST API because Vercel
 * serverless functions cannot run shell commands. This module wraps
 * the Contents API (read/write/list), Git Data API (commits, trees,
 * branches), and Pulls API (PR creation).
 */

import { env } from '$env/dynamic/private';

const OWNER = 'redbeardOS';
const REPO = 'rbos-portal';
const API = 'https://api.github.com';

interface GitHubError {
	message: string;
	status: number;
}

function getToken(): string {
	const token = env.GITHUB_TOKEN;
	if (!token) throw new Error('GITHUB_TOKEN not configured');
	return token;
}

function headers(): Record<string, string> {
	return {
		Authorization: `Bearer ${getToken()}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'Content-Type': 'application/json'
	};
}

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
	const url = path.startsWith('http') ? path : `${API}${path}`;
	const res = await fetch(url, { ...init, headers: { ...headers(), ...init?.headers } });
	if (!res.ok) {
		const body = await res.text();
		const err: GitHubError = { message: body, status: res.status };
		throw err;
	}
	return res;
}

// ── Branch operations ──────────────────────────────────────────

/** Get the SHA of the HEAD commit on a branch. */
export async function getBranchSha(branch: string): Promise<string> {
	const res = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${branch}`);
	const data = await res.json();
	return data.object.sha;
}

/** Create a new branch from a source branch (default: main). */
export async function createBranch(name: string, fromBranch = 'main'): Promise<string> {
	const sha = await getBranchSha(fromBranch);
	await ghFetch(`/repos/${OWNER}/${REPO}/git/refs`, {
		method: 'POST',
		body: JSON.stringify({ ref: `refs/heads/${name}`, sha })
	});
	return sha;
}

/** Check if a branch exists. */
export async function branchExists(name: string): Promise<boolean> {
	try {
		await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${name}`);
		return true;
	} catch {
		return false;
	}
}

// ── File operations (Contents API) ─────────────────────────────

export interface FileContent {
	path: string;
	content: string;
	sha: string;
	size: number;
}

/** Read a single file from the repo on a given branch. */
export async function readFile(path: string, branch: string): Promise<FileContent> {
	const res = await ghFetch(
		`/repos/${OWNER}/${REPO}/contents/${path}?ref=${branch}`
	);
	const data = await res.json();
	if (data.type !== 'file') throw new Error(`${path} is a ${data.type}, not a file`);
	const content = Buffer.from(data.content, 'base64').toString('utf-8');
	return { path: data.path, content, sha: data.sha, size: data.size };
}

/** Write (create or update) a file on a branch via Contents API. */
export async function writeFile(
	path: string,
	content: string,
	branch: string,
	message: string
): Promise<{ sha: string; commitSha: string }> {
	// Check if file exists (to get its SHA for updates)
	let existingSha: string | undefined;
	try {
		const existing = await readFile(path, branch);
		existingSha = existing.sha;
	} catch {
		// File doesn't exist — creating new
	}

	const body: Record<string, string> = {
		message,
		content: Buffer.from(content).toString('base64'),
		branch
	};
	if (existingSha) body.sha = existingSha;

	const res = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`, {
		method: 'PUT',
		body: JSON.stringify(body)
	});
	const data = await res.json();
	return { sha: data.content.sha, commitSha: data.commit.sha };
}

/** List files in a directory on a given branch. */
export async function listFiles(
	path: string,
	branch: string
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir'; size: number }>> {
	const res = await ghFetch(
		`/repos/${OWNER}/${REPO}/contents/${path}?ref=${branch}`
	);
	const data = await res.json();
	if (!Array.isArray(data)) throw new Error(`${path} is not a directory`);
	return data.map((item: { name: string; path: string; type: string; size: number }) => ({
		name: item.name,
		path: item.path,
		type: item.type as 'file' | 'dir',
		size: item.size
	}));
}

// ── Multi-file commit (Git Data API) ──────────────────────────

export interface FileChange {
	path: string;
	content: string;
}

/**
 * Create a single commit with multiple file changes using the Git Data API.
 * This is more efficient than multiple Contents API calls when writing several files.
 *
 * Flow: create blobs → create tree → create commit → update ref
 */
export async function commitFiles(
	files: FileChange[],
	message: string,
	branch: string
): Promise<{ commitSha: string }> {
	const headSha = await getBranchSha(branch);

	// 1. Create blobs for each file
	const blobs = await Promise.all(
		files.map(async (f) => {
			const res = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs`, {
				method: 'POST',
				body: JSON.stringify({ content: f.content, encoding: 'utf-8' })
			});
			const data = await res.json();
			return { path: f.path, sha: data.sha };
		})
	);

	// 2. Create tree
	const treeRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees`, {
		method: 'POST',
		body: JSON.stringify({
			base_tree: headSha,
			tree: blobs.map((b) => ({
				path: b.path,
				mode: '100644',
				type: 'blob',
				sha: b.sha
			}))
		})
	});
	const treeData = await treeRes.json();

	// 3. Create commit
	const commitRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits`, {
		method: 'POST',
		body: JSON.stringify({
			message,
			tree: treeData.sha,
			parents: [headSha]
		})
	});
	const commitData = await commitRes.json();

	// 4. Update branch ref
	await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, {
		method: 'PATCH',
		body: JSON.stringify({ sha: commitData.sha })
	});

	return { commitSha: commitData.sha };
}

// ── PR operations ──────────────────────────────────────────────

export interface PrResult {
	number: number;
	url: string;
	title: string;
}

/** Create a pull request from a branch to main. */
export async function createPullRequest(
	title: string,
	body: string,
	headBranch: string,
	baseBranch = 'main'
): Promise<PrResult> {
	const res = await ghFetch(`/repos/${OWNER}/${REPO}/pulls`, {
		method: 'POST',
		body: JSON.stringify({
			title,
			body,
			head: headBranch,
			base: baseBranch
		})
	});
	const data = await res.json();
	return { number: data.number, url: data.html_url, title: data.title };
}
