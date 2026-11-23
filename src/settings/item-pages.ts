import { SettingDefinitionItem, SettingDefinitionPage } from 'obsidian';
import type OhMyBulletPlugin from '../main';
import {
	COLORS,
	DEFAULT_TEXT_COLOR,
	LOCKED_CHARS,
	bullet,
	bulletError,
	signifierError,
	validBullets,
	validSignifiers,
} from './defaults';
import { PreviewLine, capitalize, sampleTextFor } from './preview';

/** Draws a preview row for the given sample lines; the settings tab owns the redrawing. */
export type PreviewRow = (lines: () => PreviewLine[]) => SettingDefinitionItem;

const COLOR_OPTIONS: Record<string, string> = Object.fromEntries(
	Object.entries(COLORS).map(([key, color]) => [key, color.label]),
);
const TEXT_COLOR_OPTIONS: Record<string, string> = { [DEFAULT_TEXT_COLOR]: 'Same as the text', ...COLOR_OPTIONS };

/** One bullet: an entry in the list that opens a page with its fields. */
export function bulletPage(plugin: OhMyBulletPlugin, previewRow: PreviewRow, index: number): SettingDefinitionPage {
	const { bullets } = plugin.settings;
	const item = bullets[index] ?? bullet('', '');
	const locked = LOCKED_CHARS.has(item.char);
	const error = bulletError(bullets, index);
	const key = (field: string) => `bullets.${index}.${field}`;
	return {
		type: 'page',
		name: item.char === '' ? 'New bullet' : `- [${item.char}]`,
		desc: error ?? item.meaning,
		displayValue: item.symbol,
		status: error ? 'warning' : null,
		items: [
			previewRow(() => {
				const current = plugin.settings.bullets[index];
				return current && current.symbol
					? [{ bullet: current, text: sampleTextFor(current.char) ?? capitalize(current.meaning || 'A line with this bullet') }]
					: [];
			}),
			{
				name: 'Character',
				desc: locked
					? 'The character between the brackets. This one is fixed.'
					: 'The character between the brackets, as in "- [x]".',
				control: {
					type: 'text',
					key: key('char'),
					disabled: locked,
					validate: (value) => {
						if (value.length !== 1) return 'Enter a single character';
						if (bullets.some((b, i) => i !== index && b.char === value)) return `"${value}" is already used by another bullet`;
						return undefined;
					},
				},
			},
			{
				name: 'Symbol',
				desc: 'What is drawn in place of the checkbox. Common symbols are drawn as shapes; anything else, an emoji included, is drawn as text.',
				control: {
					type: 'text',
					key: key('symbol'),
					validate: (value) => (value.length === 0 ? 'Enter a symbol' : undefined),
				},
			},
			{
				name: 'Meaning',
				desc: 'A few words, such as "waiting for a reply". Shown in the menu, in the commands and in the legend for AI agents.',
				control: { type: 'text', key: key('meaning') },
			},
			{
				name: 'Bullet color',
				control: { type: 'dropdown', key: key('color'), options: COLOR_OPTIONS },
			},
			{
				type: 'group',
				heading: 'Text of the line',
				items: [
					{ name: 'Color', control: { type: 'dropdown', key: key('textColor'), options: TEXT_COLOR_OPTIONS } },
					{ name: 'Strikethrough', control: { type: 'toggle', key: key('strike') } },
					{ name: 'Underline', control: { type: 'toggle', key: key('underline') } },
					{ name: 'Bold', control: { type: 'toggle', key: key('bold') } },
					{ name: 'Italic', control: { type: 'toggle', key: key('italic') } },
				],
			},
		],
	};
}

/** One signifier: an entry in the list that opens a page with its fields. */
export function signifierPage(plugin: OhMyBulletPlugin, previewRow: PreviewRow, index: number): SettingDefinitionPage {
	const { signifiers } = plugin.settings;
	const item = signifiers[index];
	const error = signifierError(signifiers, index);
	const key = (field: string) => `signifiers.${index}.${field}`;
	return {
		type: 'page',
		name: !item || item.char === '' ? 'New signifier' : `- [ ] ${item.char} text`,
		desc: error ?? item?.meaning ?? '',
		displayValue: item?.symbol || item?.char || '',
		status: error ? 'warning' : null,
		items: [
			previewRow(() => {
				const current = validSignifiers(plugin.settings).find((sig) => sig.char === plugin.settings.signifiers[index]?.char);
				const bullets = validBullets(plugin.settings);
				if (!current) return [];
				// On an open task and on a done one, to show that it combines with any bullet.
				return bullets
					.filter((b) => b.char === ' ' || b.char === 'x')
					.map((b) => ({
						bullet: b,
						signifier: current,
						text: b.char === 'x' ? 'Reply to Mina about the budget' : 'Write the summary',
					}));
			}),
			{
				name: 'Character',
				desc: 'The character typed right after the checkbox, as in "- [ ] * text".',
				control: {
					type: 'text',
					key: key('char'),
					validate: (value) => {
						const candidate = signifiers.map((s, i) => (i === index ? { ...s, char: value } : s));
						return signifierError(candidate, index) ?? undefined;
					},
				},
			},
			{
				name: 'Symbol',
				desc: 'What is drawn in its place. Leave it empty to draw the character itself.',
				control: { type: 'text', key: key('symbol') },
			},
			{
				name: 'Meaning',
				desc: 'A few words, such as "priority". Shown in the menu, in the commands and in the legend for AI agents.',
				control: { type: 'text', key: key('meaning') },
			},
			{
				name: 'Color',
				control: { type: 'dropdown', key: key('color'), options: COLOR_OPTIONS },
			},
			{
				name: 'Position',
				desc: 'Where it is drawn: to the left of the bullet, on top of it, or to its right, before the text.',
				control: {
					type: 'dropdown',
					key: key('position'),
					options: { left: 'Left of bullet', center: 'On the bullet', right: 'Right of bullet' },
				},
			},
		],
	};
}
