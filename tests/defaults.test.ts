import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	OhMyBulletSettings,
	SignifierDef,
	bullet,
	bulletError,
	normalizeSettings,
	signifierError,
	validBullets,
	validSignifiers,
} from '../src/settings/defaults';

const signifier = (char: string, overrides: Partial<SignifierDef> = {}): SignifierDef => ({
	char,
	symbol: char,
	meaning: '',
	color: 'text',
	position: 'right',
	...overrides,
});

describe('bulletError', () => {
	it('accepts a complete bullet', () => {
		expect(bulletError([bullet('d', '📌')], 0)).toBeNull();
	});

	it('asks for exactly one character', () => {
		expect(bulletError([bullet('', '📌')], 0)).toBe('Enter a character');
		expect(bulletError([bullet('de', '📌')], 0)).toBe('Enter a character');
	});

	it('asks for a symbol', () => {
		expect(bulletError([bullet('d', '')], 0)).toBe('Enter a symbol');
	});

	it('flags the later of two bullets with the same character', () => {
		const bullets = [bullet(' ', '•'), bullet('x', '×'), bullet(' ', '○')];
		expect(bulletError(bullets, 0)).toBeNull();
		expect(bulletError(bullets, 2)).toBe('"space" is already used above');
	});
});

describe('signifierError', () => {
	it('rejects characters Markdown reads as a block of their own', () => {
		expect(signifierError([signifier('#')], 0)).toMatch(/heading/);
		expect(signifierError([signifier('>')], 0)).toMatch(/quote/);
	});

	it('rejects whitespace and duplicates', () => {
		expect(signifierError([signifier(' ')], 0)).toBe('Enter a character');
		expect(signifierError([signifier('*'), signifier('*')], 1)).toBe('"*" is already used above');
	});
});

describe('validBullets and validSignifiers', () => {
	it('leave out entries that are not complete', () => {
		const settings: OhMyBulletSettings = {
			...structuredClone(DEFAULT_SETTINGS),
			bullets: [bullet(' ', '•'), bullet('', ''), bullet('x', '×')],
			signifiers: [signifier('*'), signifier('#')],
		};
		expect(validBullets(settings).map((b) => b.char)).toEqual([' ', 'x']);
		expect(validSignifiers(settings).map((s) => s.char)).toEqual(['*']);
	});

	it('fill in the symbol of a signifier saved without one', () => {
		const settings: OhMyBulletSettings = {
			...structuredClone(DEFAULT_SETTINGS),
			signifiers: [signifier('*', { symbol: '' }), signifier('!', { symbol: '' })],
		};
		expect(validSignifiers(settings).map((s) => s.symbol)).toEqual(['✱', '!']);
	});
});

describe('normalizeSettings', () => {
	it('fills in what settings saved by an earlier version do not have', () => {
		// Settings as an early version saved them: no text color, meaning or position.
		const saved = {
			bullets: [
				{ char: '>', symbol: '>', color: 'text', strike: false },
				{ char: '-', symbol: '–', color: 'faint', strike: true },
			],
			signifiers: [{ char: '*', symbol: '', color: 'red' }],
		} as unknown as OhMyBulletSettings;

		normalizeSettings(saved);

		expect(saved.bullets[0]).toMatchObject({ meaning: 'task migrated to a later note', textColor: 'default', bold: false });
		// Strikethrough used to fade the text as well, so such a bullet keeps looking the same.
		expect(saved.bullets[1]).toMatchObject({ textColor: 'faint', strike: true });
		expect(saved.signifiers[0]).toMatchObject({ symbol: '✱', position: 'right', meaning: 'priority' });
		expect(saved).toMatchObject({ tapAction: 'none', agentLegend: 'ask', noteLegend: false });
	});

	it('keeps what the user set', () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		settings.tapAction = 'menu';
		settings.bullets[0]!.meaning = 'open';
		normalizeSettings(settings);
		expect(settings.tapAction).toBe('menu');
		expect(settings.bullets[0]?.meaning).toBe('open');
	});
});
