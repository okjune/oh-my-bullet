import { describe, expect, it } from 'vitest';
import { bulletOf, signifierOf, withBullet, withSignifier } from '../src/actions';
import { DEFAULT_SETTINGS } from '../src/settings/defaults';

const signifiers = DEFAULT_SETTINGS.signifiers;

describe('bulletOf', () => {
	it('reads the character between the brackets', () => {
		expect(bulletOf('- [>] Renew passport')).toBe('>');
		expect(bulletOf('- [ ] Call the landlord')).toBe(' ');
		expect(bulletOf('1. [x] Done')).toBe('x');
	});

	it('returns null for a line that is not a task', () => {
		expect(bulletOf('- Renew passport')).toBeNull();
		expect(bulletOf('Renew passport')).toBeNull();
	});
});

describe('withBullet', () => {
	it('changes the bullet of a task', () => {
		expect(withBullet('- [ ] Buy milk', 'x')).toBe('- [x] Buy milk');
		expect(withBullet('\t- [x] Buy milk', ' ')).toBe('\t- [ ] Buy milk');
	});

	it('gives a list item a checkbox', () => {
		expect(withBullet('- Buy milk', 'x')).toBe('- [x] Buy milk');
		expect(withBullet('* Buy milk', '/')).toBe('* [/] Buy milk');
		expect(withBullet('1. Buy milk', '>')).toBe('1. [>] Buy milk');
	});

	it('turns any other line into a task, keeping its indent', () => {
		expect(withBullet('Buy milk', 'o')).toBe('- [o] Buy milk');
		expect(withBullet('  Buy milk', '/')).toBe('  - [/] Buy milk');
	});
});

describe('signifierOf', () => {
	it('finds a signifier right after the checkbox', () => {
		expect(signifierOf('- [ ] * Send the deck', signifiers)).toBe('*');
		expect(signifierOf('- [x] ! Plants that text you?', signifiers)).toBe('!');
		expect(signifierOf('- [ ] *', signifiers)).toBe('*');
	});

	it('does not take emphasis or later text for a signifier', () => {
		expect(signifierOf('- [ ] *bold* text', signifiers)).toBeNull();
		expect(signifierOf('- [ ] Send * now', signifiers)).toBeNull();
		expect(signifierOf('- * Send', signifiers)).toBeNull();
	});
});

describe('withSignifier', () => {
	it('adds a signifier', () => {
		expect(withSignifier('- [ ] Send the deck', '*', signifiers)).toBe('- [ ] * Send the deck');
	});

	it('replaces the current signifier', () => {
		expect(withSignifier('- [ ] * Send the deck', '!', signifiers)).toBe('- [ ] ! Send the deck');
	});

	it('removes the signifier when given null', () => {
		expect(withSignifier('- [ ] * Send the deck', null, signifiers)).toBe('- [ ] Send the deck');
	});

	it('keeps the bullet and the indent', () => {
		expect(withSignifier('  - [>] Renew passport', '*', signifiers)).toBe('  - [>] * Renew passport');
	});

	it('leaves a line that is not a task alone', () => {
		expect(withSignifier('Send the deck', '*', signifiers)).toBe('Send the deck');
	});
});
