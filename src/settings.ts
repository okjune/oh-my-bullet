import {
	App,
	Modal,
	Notice,
	Platform,
	PluginSettingTab,
	Setting,
	SettingDefinitionItem,
	SettingDefinitionPage,
} from 'obsidian';
import type OhMyBulletPlugin from './main';
import { SIGNIFIER_ATTR, SIGNIFIER_CLASS, SIGNIFIER_HIDDEN_CLASS } from './signifiers';
import type { SignifierPosition } from './signifiers';

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

function bullet(char: string, symbol: string, overrides: Partial<BulletDef> = {}): BulletDef {
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
const LOCKED_CHARS = new Set([' ', 'x']);

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

/** Asks before throwing away the user's bullets and signifiers. */
class ResetConfirmModal extends Modal {
	constructor(
		app: App,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle('Reset to defaults?');
		this.contentEl.createEl('p', {
			text: 'Every bullet and signifier goes back to how it was when the plugin was first installed. Your notes are not changed.',
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Reset')
					.setDestructive()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}

const COLOR_OPTIONS: Record<string, string> = Object.fromEntries(
	Object.entries(COLORS).map(([key, color]) => [key, color.label]),
);
const TEXT_COLOR_OPTIONS: Record<string, string> = { [DEFAULT_TEXT_COLOR]: 'Same as the text', ...COLOR_OPTIONS };

/** One line of a preview: a bullet, optionally with a signifier, and some text. */
interface PreviewLine {
	bullet: BulletDef;
	signifier?: SignifierDef;
	text: string;
	children?: PreviewLine[];
}

/** A line of the sample day, before it is matched against the user's bullets. */
interface SampleLine {
	char: string;
	signifier?: string;
	text: string;
	children?: SampleLine[];
}

/**
 * The overview preview: a day's log as someone might actually keep it, with
 * sub-tasks, so the bullets are seen doing their job rather than listed.
 */
const SAMPLE_DAY: SampleLine[] = [
	{ char: 'O', text: 'Morning standup' },
	{ char: 'x', text: 'Reply to Mina about the budget' },
	{
		char: '/',
		text: 'Draft the quarterly report',
		children: [
			{ char: 'x', text: 'Pull last quarter\'s numbers' },
			{ char: ' ', signifier: '*', text: 'Write the summary' },
			{ char: '-', text: 'Redo the charts in the old template' },
		],
	},
	{ char: ' ', text: 'Call the landlord about the heating' },
	{ char: '>', text: 'Renew passport' },
	{ char: '<', text: 'Book the dentist' },
	{ char: ' ', signifier: '!', text: 'Try a weekly review on Fridays' },
	{ char: 'o', text: 'Team dinner at 7pm' },
];

/** What a bullet's own page shows, when the sample day has a line for it. */
function sampleTextFor(char: string): string | undefined {
	const find = (lines: SampleLine[]): string | undefined => {
		for (const line of lines) {
			if (line.char === char && !line.signifier) return line.text;
			const inner = line.children ? find(line.children) : undefined;
			if (inner) return inner;
		}
		return undefined;
	};
	return find(SAMPLE_DAY);
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Draw sample task lines with the same markup a note has in reading view, so the
 * rules generated from the settings style them. What you see is what the notes get.
 */
function fillPreview(el: HTMLElement, lines: PreviewLine[]) {
	el.empty();
	appendPreviewList(el, lines);
}

function appendPreviewList(parent: HTMLElement, lines: PreviewLine[]) {
	const list = parent.createEl('ul', { cls: 'contains-task-list has-list-bullet' });
	for (const line of lines) {
		const li = list.createEl('li', { cls: 'task-list-item' });
		// Reading view marks the open task with an empty data-task.
		li.dataset.task = line.bullet.char === ' ' ? '' : line.bullet.char;
		const checkbox = li.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
		checkbox.checked = line.bullet.char !== ' ';
		checkbox.tabIndex = -1;
		if (line.signifier) {
			const span = li.createSpan({ cls: SIGNIFIER_CLASS, text: line.signifier.symbol || line.signifier.char });
			span.dataset.signifier = line.signifier.char;
			if (line.signifier.position !== 'right') {
				li.setAttribute(SIGNIFIER_ATTR, line.signifier.char);
				span.addClass(SIGNIFIER_HIDDEN_CLASS);
			} else {
				li.appendText(' ');
			}
		}
		// The text sits in a span so a struck-through parent does not strike its children.
		li.createSpan({ cls: 'oh-my-bullet-preview-text', text: line.text });
		if (line.children && line.children.length > 0) appendPreviewList(li, line.children);
	}
}

/**
 * The settings are declared, not drawn: Obsidian renders them, saves them and
 * indexes them for the settings search. Each bullet and signifier is an entry in
 * a list that opens a page of its own, which also suits a phone.
 */
export class OhMyBulletSettingTab extends PluginSettingTab {
	plugin: OhMyBulletPlugin;

	/** Redraw functions of the previews currently on screen. */
	private previews = new Set<() => void>();

	constructor(app: App, plugin: OhMyBulletPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** A row that shows sample lines and redraws itself whenever a setting changes. */
	private previewRow(lines: () => PreviewLine[]): SettingDefinitionItem {
		return {
			name: 'Preview',
			searchable: false,
			render: (setting) => {
				setting.settingEl.addClass('oh-my-bullet-preview');
				const el = setting.settingEl.createDiv({ cls: 'oh-my-bullet-preview-lines markdown-rendered show-indentation-guide' });
				// The settings open in a window of their own, which has not been given the
				// generated styles yet: it is not a workspace window, so no event announces it.
				const win = el.ownerDocument.defaultView;
				if (win) this.plugin.attachWindow(win);
				const draw = () => fillPreview(el, lines());
				draw();
				this.previews.add(draw);
				return () => this.previews.delete(draw);
			},
		};
	}

	private redrawPreviews() {
		this.previews.forEach((draw) => draw());
	}

	/**
	 * The sample day, drawn with the user's bullets. A line whose bullet or signifier
	 * the user has removed is left out; anything the user has added follows at the end.
	 */
	private overviewLines(): PreviewLine[] {
		const bullets = validBullets(this.plugin.settings);
		const signifiers = validSignifiers(this.plugin.settings);
		const usedBullets = new Set<string>();
		const usedSignifiers = new Set<string>();

		const resolve = (lines: SampleLine[]): PreviewLine[] =>
			lines.flatMap((line) => {
				const bullet = bullets.find((b) => b.char === line.char);
				const signifier = line.signifier ? signifiers.find((sig) => sig.char === line.signifier) : undefined;
				if (!bullet || (line.signifier && !signifier)) return [];
				usedBullets.add(bullet.char);
				if (signifier) usedSignifiers.add(signifier.char);
				return [{ bullet, signifier, text: line.text, children: line.children ? resolve(line.children) : undefined }];
			});

		const lines = resolve(SAMPLE_DAY);
		const task = bullets.find((b) => b.char === ' ') ?? bullets[0];
		for (const bullet of bullets) {
			if (!usedBullets.has(bullet.char)) lines.push({ bullet, text: capitalize(bullet.meaning || `[${bullet.char}]`) });
		}
		for (const signifier of signifiers) {
			if (task && !usedSignifiers.has(signifier.char)) {
				lines.push({ bullet: task, signifier, text: capitalize(signifier.meaning || signifier.char) });
			}
		}
		return lines;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const { settings } = this.plugin;
		const mobile = Platform.isMobile;
		const save = async () => {
			await this.plugin.saveSettings();
			this.update();
		};

		return [
			this.previewRow(() => this.overviewLines()),
			{
				type: 'group',
				heading: 'Changing a bullet',
				items: [
					{
						name: mobile ? 'Tapping a bullet' : 'Clicking a bullet',
						desc: mobile
							? 'What a short tap does. Nothing, unless you choose otherwise, so a stray tap never changes a task.'
							: 'What a plain click does. Nothing, unless you choose otherwise, so a stray click never changes a task.',
						control: {
							type: 'dropdown',
							key: 'tapAction',
							options: { none: 'Do nothing', toggle: 'Mark the task done', menu: 'Open the menu' },
						},
					},
					{
						name: mobile ? 'Touch and hold' : 'Right-click',
						desc: 'Opens a menu with every bullet and signifier.',
					},
					mobile
						? {
								name: 'From the toolbar',
								desc: 'Add "Oh My Bullet: Choose a bullet for this line" to the mobile toolbar (search these settings for "toolbar"). The button opens the same menu for the line you are typing on, so you do not have to hit the bullet.',
							}
						: {
								name: 'From the keyboard',
								desc: 'Give "Oh My Bullet: Choose a bullet for this line" a hotkey to open the same menu for the line the cursor is on. Each bullet and signifier also has a command of its own.',
							},
				],
			},
			{
				type: 'list',
				heading: 'Bullets',
				emptyState: 'No bullets.',
				addItem: {
					name: 'Add bullet',
					action: () => {
						settings.bullets.push(bullet('', ''));
						void save();
					},
				},
				onReorder: (from, to) => {
					const [moved] = settings.bullets.splice(from, 1);
					if (moved) settings.bullets.splice(to, 0, moved);
					void save();
				},
				onDelete: (index) => {
					if (LOCKED_CHARS.has(settings.bullets[index]?.char ?? '')) {
						new Notice('The task and done bullets cannot be removed.');
					} else {
						settings.bullets.splice(index, 1);
					}
					void save();
				},
				items: settings.bullets.map((_, index) => this.bulletPage(index)),
			},
			{
				type: 'list',
				heading: 'Signifiers',
				emptyState: 'No signifiers. A signifier is a character typed right after the checkbox, as in "- [ ] * text".',
				addItem: {
					name: 'Add signifier',
					action: () => {
						settings.signifiers.push({ char: '', symbol: '', meaning: '', color: 'text', position: 'right' });
						void save();
					},
				},
				onReorder: (from, to) => {
					const [moved] = settings.signifiers.splice(from, 1);
					if (moved) settings.signifiers.splice(to, 0, moved);
					void save();
				},
				onDelete: (index) => {
					settings.signifiers.splice(index, 1);
					void save();
				},
				items: settings.signifiers.map((_, index) => this.signifierPage(index)),
			},
			{
				type: 'group',
				heading: 'AI agents',
				items: [
					{
						name: 'Keep a legend for AI agents',
						desc: 'Agents read the raw text of your notes, not the symbols. This maintains a marked section in AGENTS.md and CLAUDE.md at the top of the vault that says what each bullet and signifier means. If neither file exists, AGENTS.md is created. The rest of those files is never touched.',
						control: { type: 'toggle', key: 'agentLegend' },
					},
					{
						name: 'Also add a legend to each note',
						desc: 'Writes a "bullet-legend" property into notes that use bullets or signifiers beyond the plain task and done, so the meaning travels with the note. Updated when you leave the note.',
						control: { type: 'toggle', key: 'noteLegend' },
					},
				],
			},
			{
				name: 'Reset to defaults',
				desc: 'Restore the bullets and signifiers the plugin comes with. Your notes are not changed.',
				render: (setting) => {
					setting.addButton((button) =>
						button
							.setButtonText('Reset')
							.setDestructive()
							.onClick(() => {
								new ResetConfirmModal(this.app, () => {
									void this.plugin.resetSettings().then(() => this.update());
								}).open();
							}),
					);
				},
			},
		];
	}

	/** One bullet: an entry in the list that opens a page with its fields. */
	private bulletPage(index: number): SettingDefinitionPage {
		const { bullets } = this.plugin.settings;
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
				this.previewRow(() => {
					const current = this.plugin.settings.bullets[index];
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
	private signifierPage(index: number): SettingDefinitionPage {
		const { signifiers } = this.plugin.settings;
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
				this.previewRow(() => {
					const current = validSignifiers(this.plugin.settings).find((sig) => sig.char === this.plugin.settings.signifiers[index]?.char);
					const bullets = validBullets(this.plugin.settings);
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

	/**
	 * Keys are paths into the settings, such as `bullets.3.symbol`.
	 * `agentLegend` is three-valued in storage (not yet asked, on, off) but a toggle here.
	 */
	getControlValue(key: string): unknown {
		if (key === 'agentLegend') return this.plugin.settings.agentLegend === 'on';
		let value: unknown = this.plugin.settings;
		for (const part of key.split('.')) {
			if (value === null || typeof value !== 'object') return undefined;
			value = (value as Record<string, unknown>)[part];
		}
		return value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'agentLegend') {
			this.plugin.settings.agentLegend = value ? 'on' : 'off';
		} else {
			const parts = key.split('.');
			const last = parts.pop();
			let target: unknown = this.plugin.settings;
			for (const part of parts) {
				if (target === null || typeof target !== 'object') return;
				target = (target as Record<string, unknown>)[part];
			}
			if (last === undefined || target === null || typeof target !== 'object') return;
			(target as Record<string, unknown>)[last] = typeof value === 'string' && last === 'meaning' ? value.trim() : value;
		}
		// Overriding this method replaces Obsidian's own save.
		await this.plugin.saveSettings();
		this.redrawPreviews();
	}
}
