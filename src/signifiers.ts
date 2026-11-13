export interface Signifier {
	/** The single character typed after the checkbox, e.g. `*` in `- [ ] * text`. */
	char: string;
	/** What is drawn in its place; an asterisk, for one, sits too high in most fonts. */
	symbol: string;
	/** Where it is drawn relative to the bullet. `right` keeps it inline, before the text. */
	position: SignifierPosition;
}

export type SignifierPosition = 'left' | 'center' | 'right';

/** Attribute set on the task line (Live Preview) or list item (reading view) for left/center signifiers. */
export const SIGNIFIER_ATTR = 'data-custom-bullets-signifier';
export const SIGNIFIER_HIDDEN_CLASS = 'custom-bullets-signifier-hidden';

export const SIGNIFIER_CLASS = 'custom-bullets-signifier';

function escapeForCharClass(char: string): string {
	return char.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * Matches a task line that starts with a signifier:
 *   `- [x] * text`  ->  groups: 1 = everything before the signifier, 2 = the signifier
 */
export function buildTaskLineRegex(signifiers: Signifier[]): RegExp | null {
	if (signifiers.length === 0) return null;
	const chars = signifiers.map((s) => escapeForCharClass(s.char)).join('');
	return new RegExp(`^(\\s*(?:[-*+]|\\d+[.)])\\s\\[.\\]\\s)([${chars}])(?=\\s)`);
}

/** Matches rendered text that starts with a signifier: `! text`. */
export function buildLeadingTextRegex(signifiers: Signifier[]): RegExp | null {
	if (signifiers.length === 0) return null;
	const chars = signifiers.map((s) => escapeForCharClass(s.char)).join('');
	return new RegExp(`^(\\s*)([${chars}])(\\s)`);
}
