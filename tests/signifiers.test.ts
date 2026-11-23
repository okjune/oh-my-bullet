import { describe, expect, it } from 'vitest';
import { Signifier, buildLeadingTextRegex, buildTaskLineRegex } from '../src/signifiers';

const signifier = (char: string): Signifier => ({ char, symbol: char, position: 'right' });

describe('buildTaskLineRegex', () => {
	it('returns null without signifiers', () => {
		expect(buildTaskLineRegex([])).toBeNull();
	});

	it('splits a task line into its prefix and signifier', () => {
		const regex = buildTaskLineRegex([signifier('*'), signifier('!')]);
		const match = regex?.exec('  - [x] * Send the deck');
		expect(match?.[1]).toBe('  - [x] ');
		expect(match?.[2]).toBe('*');
		expect(regex?.exec('1. [ ] ! Idea')?.[2]).toBe('!');
	});

	it('needs a space after the signifier', () => {
		const regex = buildTaskLineRegex([signifier('*')]);
		expect(regex?.exec('- [ ] *bold*')).toBeNull();
		expect(regex?.exec('- [ ] Send the deck')).toBeNull();
	});

	// These characters mean something inside a regular expression character class.
	it.each(['-', ']', '^', '\\'])('handles %s as a signifier', (char) => {
		const regex = buildTaskLineRegex([signifier('*'), signifier(char)]);
		expect(regex?.exec(`- [ ] ${char} text`)?.[2]).toBe(char);
		expect(regex?.exec('- [ ] a text')).toBeNull();
	});
});

describe('buildLeadingTextRegex', () => {
	it('finds a signifier at the start of rendered text', () => {
		const match = buildLeadingTextRegex([signifier('!')])?.exec('! Plants that text you?');
		expect(match?.[2]).toBe('!');
		expect(match?.[3]).toBe(' ');
	});

	it('does not match the character further along', () => {
		expect(buildLeadingTextRegex([signifier('!')])?.exec('Wow! Plants')).toBeNull();
	});
});
