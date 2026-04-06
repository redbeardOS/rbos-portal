/**
 * RBOS Theme Store — Svelte 5 runes
 *
 * Manages theme selection, persistence, and DOM attribute.
 * No context needed — singleton pattern via module-level state.
 */
import { browser } from '$app/environment';

export type ThemeId =
	| 'redbeard-dark'
	| 'midnight-teal'
	| 'ember-forge'
	| 'aurora-green'
	| 'phantom-purple'
	| 'silicon-muse'
	| 'silicon-muse-light';

export type ThemeMeta = {
	id: ThemeId;
	label: string;
	description: string;
	preview: {
		bg: string;
		accent: string;
	};
};

export const THEMES: ThemeMeta[] = [
	{
		id: 'redbeard-dark',
		label: 'RedBeard Dark',
		description: 'Amber accents on deep charcoal',
		preview: { bg: '#0a0c10', accent: '#f59e0b' }
	},
	{
		id: 'midnight-teal',
		label: 'Midnight Teal',
		description: 'Cool teal on deep navy',
		preview: { bg: '#0a1118', accent: '#14b8a6' }
	},
	{
		id: 'ember-forge',
		label: 'Ember Forge',
		description: 'Forge-fire reds on volcanic dark',
		preview: { bg: '#100c0a', accent: '#ef4444' }
	},
	{
		id: 'aurora-green',
		label: 'Aurora Green',
		description: 'Electric green on dark slate',
		preview: { bg: '#080c0a', accent: '#22c55e' }
	},
	{
		id: 'phantom-purple',
		label: 'Phantom Purple',
		description: 'Deep violet on obsidian',
		preview: { bg: '#0a0812', accent: '#a855f7' }
	},
	{
		id: 'silicon-muse',
		label: 'Silicon Muse',
		description: 'Sage & Graphite — calm, contemplative',
		preview: { bg: '#131313', accent: '#87a38f' }
	},
	{
		id: 'silicon-muse-light',
		label: 'Silicon Muse Light',
		description: 'Sage & White — clean, botanical',
		preview: { bg: '#f4f7f5', accent: '#4d7a56' }
	}
];

const DEFAULT_THEME: ThemeId = 'redbeard-dark';

function createThemeState() {
	let current = $state<ThemeId>(DEFAULT_THEME);

	if (browser) {
		const stored = localStorage.getItem('rbos-theme') as ThemeId | null;
		if (stored && THEMES.some((t) => t.id === stored)) {
			current = stored;
		}
		document.documentElement.setAttribute('data-theme', current);
	}

	return {
		get current() {
			return current;
		},
		set(id: ThemeId) {
			if (!THEMES.some((t) => t.id === id)) return;
			current = id;
			if (browser) {
				localStorage.setItem('rbos-theme', id);
				document.documentElement.setAttribute('data-theme', id);
			}
		},
		get meta() {
			return THEMES.find((t) => t.id === current) ?? THEMES[0];
		}
	};
}

export const themeState = createThemeState();
