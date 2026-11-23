import type { SignifierPosition } from '../signifiers';

/** Theme colors, so every choice follows light and dark mode. */
export const COLORS: Record<string, { label: string; css: string }> = {
	text: { label: 'Text', css: 'var(--text-normal)' },
	muted: { label: 'Muted', css: 'var(--text-muted)' },
	faint: { label: 'Faint', css: 'var(--text-faint)' },
	accent: { label: 'Accent', css: 'var(--text-accent)' },
	red: { label: 'Red', css: 'var(--color-red)' },
	orange: { label: 'Orange', css: 'var(--color-orange)' },
	yellow: { label: 'Yellow', css: 'var(--color-yellow)' },
	green: { label: 'Green', css: 'var(--color-green)' },
	cyan: { label: 'Cyan', css: 'var(--color-cyan)' },
	blue: { label: 'Blue', css: 'var(--color-blue)' },
	purple: { label: 'Purple', css: 'var(--color-purple)' },
	pink: { label: 'Pink', css: 'var(--color-pink)' },
};

export interface BulletDef {
	/** The character between the brackets: `x` in `- [x]`. A space is the open task. */
	char: string;
	/** What is drawn in place of the checkbox. */
	symbol: string;
	/** What the bullet means, in words. Written into the legend for AI agents. */
	meaning: string;
	/** Color of the bullet itself. */
	color: string;
	/** Color of the line's text; `default` leaves it alone. */
	textColor: string;
	strike: boolean;
	underline: boolean;
	bold: boolean;
	italic: boolean;
}

export const DEFAULT_TEXT_COLOR = 'default';

/** A bullet with plain styling; `overrides` sets anything else. */
export function bullet(char: string, symbol: string, overrides: Partial<BulletDef> = {}): BulletDef {
	return {
		char,
		symbol,
		meaning: '',
		color: 'text',
		textColor: DEFAULT_TEXT_COLOR,
		strike: false,
		underline: false,
		bold: false,
		italic: false,
		...overrides,
	};
}

export interface SignifierDef {
	/** The character typed right after the checkbox: `*` in `- [ ] * text`. */
	char: string;
	/** What is drawn in place of the character. */
	symbol: string;
	/** What the signifier means, in words. Written into the legend for AI agents. */
	meaning: string;
	color: string;
	/** Left of the bullet, on top of it, or right of it (inline, before the text). */
	position: SignifierPosition;
}

/** `ask` until the user has answered the first-run question. */
export type AgentLegendMode = 'ask' | 'on' | 'off';

/** What a short tap or click on a bullet does. */
export type TapAction = 'none' | 'toggle' | 'menu';

export interface OhMyBulletSettings {
	bullets: BulletDef[];
	signifiers: SignifierDef[];
	/** A stray tap should not change a task, so the default is to do nothing. */
	tapAction: TapAction;
	/** Keep a legend in the vault's agent instruction files (AGENTS.md, CLAUDE.md). */
	agentLegend: AgentLegendMode;
	/** Also write a legend into the properties of each note that uses the notation. */
	noteLegend: boolean;
}

export const DEFAULT_SETTINGS: OhMyBulletSettings = {
	bullets: [
		bullet(' ', '•', { meaning: 'task, not done' }),
		bullet('/', '/', { meaning: 'task in progress' }),
		bullet('x', '×', { meaning: 'task, done' }),
		bullet('>', '>', { meaning: 'task migrated to a later note' }),
		bullet('<', '<', { meaning: 'task scheduled for a future date' }),
		bullet('-', '–', { meaning: 'no longer relevant, dropped', color: 'faint', textColor: 'faint', strike: true }),
		bullet('o', '○', { meaning: 'event' }),
		bullet('O', '●', { meaning: 'event that has taken place' }),
	],
	signifiers: [
		{ char: '*', symbol: '✱', meaning: 'priority', color: 'red', position: 'right' },
		{ char: '!', symbol: '!', meaning: 'inspiration, an idea worth keeping', color: 'orange', position: 'right' },
	],
	tapAction: 'none',
	agentLegend: 'ask',
	noteLegend: false,
};

/** Fill in what settings saved by an earlier version do not have. */
export function normalizeSettings(settings: OhMyBulletSettings) {
	settings.bullets = settings.bullets.map((b) => {
		// Strikethrough used to fade the text as well.
		const textColor = b.textColor ?? (b.strike ? 'faint' : DEFAULT_TEXT_COLOR);
		const meaning = b.meaning ?? DEFAULT_SETTINGS.bullets.find((d) => d.char === b.char)?.meaning ?? '';
		return bullet(b.char, b.symbol, { ...b, textColor, meaning });
	});
	for (const signifier of settings.signifiers) {
		if (!signifier.symbol) signifier.symbol = signifier.char === '*' ? '✱' : signifier.char;
		signifier.position ??= 'right';
		signifier.meaning ??= DEFAULT_SETTINGS.signifiers.find((d) => d.char === signifier.char)?.meaning ?? '';
	}
	settings.tapAction ??= 'none';
	settings.agentLegend ??= 'ask';
	settings.noteLegend ??= false;
}

/** Why a bullet row is ignored, or null when it is fine. */
export function bulletError(bullets: BulletDef[], index: number): string | null {
	const item = bullets[index];
	if (!item) return null;
	if (item.char.length !== 1) return 'Enter a character';
	if (bullets.findIndex((b) => b.char === item.char) !== index) return `"${item.char === ' ' ? 'space' : item.char}" is already used above`;
	if (item.symbol.length === 0) return 'Enter a symbol';
	return null;
}

/** Why a signifier row is ignored, or null when it is fine. */
export function signifierError(signifiers: SignifierDef[], index: number): string | null {
	const item = signifiers[index];
	if (!item) return null;
	if (item.char.length !== 1 || /\s/.test(item.char)) return 'Enter a character';
	if (signifiers.findIndex((s) => s.char === item.char) !== index) return `"${item.char}" is already used above`;
	// After a checkbox these start a block of their own, which reading view then draws on a new line.
	if (item.char === '#') return 'Markdown reads "#" here as a heading; choose another character';
	if (item.char === '>') return 'Markdown reads ">" here as a quote; choose another character';
	return null;
}

/** The open task and the done task always exist; their characters are fixed. */
export const LOCKED_CHARS = new Set([' ', 'x']);

/** Entries that are complete and not duplicated; the rest are ignored until fixed. */
export function validBullets(settings: OhMyBulletSettings): BulletDef[] {
	return settings.bullets.filter((_, index) => bulletError(settings.bullets, index) === null);
}

export function validSignifiers(settings: OhMyBulletSettings): SignifierDef[] {
	return settings.signifiers
		.filter((_, index) => signifierError(settings.signifiers, index) === null)
		// Settings saved by an earlier version have no symbol or position.
		.map((s) => ({ ...s, symbol: s.symbol || (s.char === '*' ? '✱' : s.char), position: s.position ?? 'right' }));
}
