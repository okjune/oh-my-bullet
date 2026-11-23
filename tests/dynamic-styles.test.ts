import { describe, expect, it } from 'vitest';
import { buildDynamicCss } from '../src/dynamic-styles';
import { DEFAULT_SETTINGS, OhMyBulletSettings, bullet } from '../src/settings/defaults';

const withBullets = (...bullets: ReturnType<typeof bullet>[]): OhMyBulletSettings => ({
	...structuredClone(DEFAULT_SETTINGS),
	bullets,
	signifiers: [],
});

describe('buildDynamicCss', () => {
	it('styles the open task by its unchecked box', () => {
		const css = buildDynamicCss(withBullets(bullet(' ', '•')));
		expect(css).toContain('input.task-list-item-checkbox:not(:checked)');
	});

	it('escapes a quote or backslash the user chose, so the stylesheet stays valid', () => {
		const css = buildDynamicCss(withBullets(bullet('"', '"'), bullet('\\', '\\')));
		expect(css).toContain('[data-task="\\""]');
		expect(css).toContain('[data-task="\\\\"]');
		expect(css).toContain('content: "\\"" !important');
	});

	it('writes the line style of a bullet', () => {
		const css = buildDynamicCss(withBullets(bullet('-', '–', { strike: true, underline: true })));
		expect(css).toContain('text-decoration: line-through underline !important');
	});
});
