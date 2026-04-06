/**
 * Conversations sidebar state.
 * Manages the list of conversations and the active conversation ID.
 */

export interface Conversation {
	id: string;
	title: string | null;
	created_at: string;
	updated_at: string;
}

export class ConversationListState {
	conversations = $state<Conversation[]>([]);
	loading = $state(false);
	activeId = $state<string | null>(null);

	async load() {
		this.loading = true;
		try {
			const res = await fetch('/api/conversations?limit=50');
			if (res.ok) {
				this.conversations = await res.json();
			}
		} catch (err) {
			console.error('Failed to load conversations:', err);
		} finally {
			this.loading = false;
		}
	}

	setActive(id: string | null) {
		this.activeId = id;
	}

	/** Add or update a conversation at the top of the list. */
	upsert(conv: Conversation) {
		const idx = this.conversations.findIndex((c) => c.id === conv.id);
		if (idx >= 0) {
			this.conversations[idx] = conv;
		} else {
			this.conversations.unshift(conv);
		}
	}

	async remove(id: string) {
		const res = await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' });
		if (res.ok) {
			this.conversations = this.conversations.filter((c) => c.id !== id);
			if (this.activeId === id) {
				this.activeId = null;
			}
		}
	}
}
