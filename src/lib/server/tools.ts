/**
 * Tool definitions, deny-list filter, and execution router for FLUX.
 *
 * Sprint 1 tools: read_file, write_file, list_files, git_commit,
 * git_push (via commitFiles), github_create_pr.
 *
 * run_command is deferred — Vercel serverless can't exec shell commands.
 * File writes accumulate in a pending changeset, then git_commit batches
 * them into a single commit via the GitHub Git Data API.
 */

import {
	readFile,
	writeFile,
	listFiles,
	createBranch,
	branchExists,
	commitFiles,
	createPullRequest,
	type FileChange,
	type PrResult
} from './github';

// ── OpenAI-compatible tool definitions ─────────────────────────

export const TOOL_DEFINITIONS = [
	{
		type: 'function' as const,
		function: {
			name: 'read_file',
			description:
				'Read the contents of a file from the repository. Returns the file content as a string.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'File path relative to repo root (e.g. "src/routes/+page.svelte")'
					}
				},
				required: ['path']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'write_file',
			description:
				'Write content to a file in the working branch. Creates the file if it does not exist, overwrites if it does. The file is staged but NOT committed — use git_commit to commit staged changes.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description: 'File path relative to repo root'
					},
					content: {
						type: 'string',
						description: 'Full file content to write'
					}
				},
				required: ['path', 'content']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'list_files',
			description:
				'List files and directories at a given path in the repository. Returns name, path, type (file/dir), and size for each entry.',
			parameters: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Directory path relative to repo root. Use "" or "." for root.'
					}
				},
				required: ['path']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'git_commit',
			description:
				'Commit all pending file changes to the working branch in a single commit. Returns the commit SHA. You must have written at least one file before committing.',
			parameters: {
				type: 'object',
				properties: {
					message: {
						type: 'string',
						description: 'Commit message (conventional-commits style preferred)'
					}
				},
				required: ['message']
			}
		}
	},
	{
		type: 'function' as const,
		function: {
			name: 'github_create_pr',
			description:
				'Open a pull request from the working branch to main. Returns the PR number and URL. Alex (the human reviewer) will review and merge.',
			parameters: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						description: 'PR title (short, descriptive)'
					},
					body: {
						type: 'string',
						description: 'PR description in markdown'
					}
				},
				required: ['title', 'body']
			}
		}
	}
];

// ── Deny-List Filter (D1-D7) ──────────────────────────────────

/** Paths that are always blocked for reading (D3 — Secrets). */
const SECRETS_PATTERNS = [
	/\.env($|\.)/,
	/secrets\//,
	/\.pem$/,
	/\.key$/,
	/id_rsa/,
	/id_ed25519/
];

/** Paths that are blocked for writing (D2 — Destructive Filesystem). */
const BLOCKED_WRITE_PATHS = [
	/^\.git\//,
	/^node_modules\//
];

interface DenyResult {
	denied: boolean;
	category?: string;
	reason?: string;
}

function checkDenyList(tool: string, args: Record<string, unknown>): DenyResult {
	const path = (args.path as string) ?? '';

	// D3 — Secrets: block reading sensitive files
	if (tool === 'read_file') {
		for (const pattern of SECRETS_PATTERNS) {
			if (pattern.test(path)) {
				return {
					denied: true,
					category: 'D3',
					reason: `Blocked: reading secrets file "${path}" is denied (D3 — Secrets and Credentials)`
				};
			}
		}
	}

	// D2 — Destructive Filesystem: block writing to protected paths
	if (tool === 'write_file') {
		for (const pattern of BLOCKED_WRITE_PATHS) {
			if (pattern.test(path)) {
				return {
					denied: true,
					category: 'D2',
					reason: `Blocked: writing to "${path}" is denied (D2 — Destructive Filesystem)`
				};
			}
		}
		// Also check D3 for writing secrets
		for (const pattern of SECRETS_PATTERNS) {
			if (pattern.test(path)) {
				return {
					denied: true,
					category: 'D3',
					reason: `Blocked: writing secrets file "${path}" is denied (D3 — Secrets and Credentials)`
				};
			}
		}
	}

	return { denied: false };
}

// ── Execution Context ──────────────────────────────────────────

/**
 * Holds the state for a single agent task execution.
 * Tracks the working branch and pending file changes.
 */
export class TaskContext {
	branch: string;
	pendingFiles: Map<string, string> = new Map();
	branchCreated = false;
	prResult: PrResult | null = null;

	constructor(taskSlug: string) {
		this.branch = `flux/${taskSlug}`;
	}

	/** Ensure the working branch exists. */
	async ensureBranch(): Promise<void> {
		if (this.branchCreated) return;
		const exists = await branchExists(this.branch);
		if (!exists) {
			await createBranch(this.branch);
		}
		this.branchCreated = true;
	}
}

// ── Tool Execution Router ──────────────────────────────────────

export interface ToolCallInput {
	name: string;
	arguments: string; // JSON string
}

export interface ToolCallResult {
	content: string;
	denied?: boolean;
	prOpened?: PrResult;
}

/**
 * Execute a single tool call within a task context.
 * Checks the deny-list before executing.
 */
export async function executeTool(
	call: ToolCallInput,
	ctx: TaskContext
): Promise<ToolCallResult> {
	let args: Record<string, unknown>;
	try {
		args = JSON.parse(call.arguments);
	} catch {
		return { content: `Error: invalid JSON arguments — ${call.arguments}` };
	}

	// Deny-list check
	const deny = checkDenyList(call.name, args);
	if (deny.denied) {
		return { content: deny.reason ?? 'Operation denied by runtime deny-list', denied: true };
	}

	try {
		switch (call.name) {
			case 'read_file': {
				await ctx.ensureBranch();
				const file = await readFile(args.path as string, ctx.branch);
				return { content: file.content };
			}

			case 'write_file': {
				await ctx.ensureBranch();
				const path = args.path as string;
				const content = args.content as string;
				// Stage in pending changeset (committed by git_commit)
				ctx.pendingFiles.set(path, content);
				return { content: `Staged "${path}" (${content.length} chars). Use git_commit to commit.` };
			}

			case 'list_files': {
				await ctx.ensureBranch();
				let dirPath = (args.path as string) ?? '';
				if (dirPath === '.' || dirPath === '') dirPath = '';
				const entries = await listFiles(dirPath, ctx.branch);
				const listing = entries
					.map((e) => `${e.type === 'dir' ? 'd' : 'f'} ${e.path} (${e.size}b)`)
					.join('\n');
				return { content: listing || '(empty directory)' };
			}

			case 'git_commit': {
				if (ctx.pendingFiles.size === 0) {
					return { content: 'Error: no pending file changes to commit. Use write_file first.' };
				}
				await ctx.ensureBranch();
				const files: FileChange[] = [];
				for (const [path, content] of ctx.pendingFiles) {
					files.push({ path, content });
				}
				const message = args.message as string;
				const result = await commitFiles(files, message, ctx.branch);
				const count = ctx.pendingFiles.size;
				ctx.pendingFiles.clear();
				return {
					content: `Committed ${count} file(s) to ${ctx.branch}: ${result.commitSha.slice(0, 7)}\nMessage: ${message}`
				};
			}

			case 'github_create_pr': {
				const title = args.title as string;
				const body = args.body as string;
				const pr = await createPullRequest(title, body, ctx.branch);
				ctx.prResult = pr;
				return {
					content: `PR #${pr.number} opened: ${pr.url}\nTitle: ${pr.title}`,
					prOpened: pr
				};
			}

			default:
				return { content: `Error: unknown tool "${call.name}"` };
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : JSON.stringify(err);
		const stack = err instanceof Error ? err.stack : undefined;
		console.error(`Tool execution error [${call.name}]:`, msg, stack);

		return {
			content: `Error executing ${call.name}: ${msg}\n\nYou may retry this operation or try a different approach.`
		};
	}
}
