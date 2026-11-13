import { App, Modal, PluginSettingTab, Setting } from 'obsidian';
import type CustomBulletsPlugin from './main';
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

type TextStyleKey = 'strike' | 'underline' | 'bold' | 'italic';

const TEXT_STYLES: { key: TextStyleKey; icon: string; label: string }[] = [
	{ key: 'strike', icon: 'strikethrough', label: 'Strikethrough' },
	{ key: 'underline', icon: 'underline', label: 'Underline' },
	{ key: 'bold', icon: 'bold', label: 'Bold' },
	{ key: 'italic', icon: 'italic', label: 'Italic' },
];

function bullet(char: string, symbol: string, overrides: Partial<BulletDef> = {}): BulletDef {
	return {
		char,
		symbol,
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
	color: string;
	/** Left of the bullet, on top of it, or right of it (inline, before the text). */
	position: SignifierPosition;
}

export interface CustomBulletsSettings {
	bullets: BulletDef[];
	signifiers: SignifierDef[];
}

export const DEFAULT_SETTINGS: CustomBulletsSettings = {
	bullets: [
		bullet(' ', '•'),
		bullet('x', '×'),
		bullet('>', '>'),
		bullet('<', '<'),
		bullet('-', '–', { color: 'faint', textColor: 'faint', strike: true }),
		bullet('o', '○'),
		bullet('O', '●'),
	],
	signifiers: [
		{ char: '*', symbol: '✱', color: 'red', position: 'right' },
		{ char: '!', symbol: '!', color: 'orange', position: 'right' },
	],
};

/** Fill in what settings saved by an earlier version do not have. */
export function normalizeSettings(settings: CustomBulletsSettings) {
	settings.bullets = settings.bullets.map((b) => {
		// Strikethrough used to fade the text as well.
		const textColor = b.textColor ?? (b.strike ? 'faint' : DEFAULT_TEXT_COLOR);
		return bullet(b.char, b.symbol, { ...b, textColor });
	});
	for (const signifier of settings.signifiers) {
		if (!signifier.symbol) signifier.symbol = signifier.char === '*' ? '✱' : signifier.char;
		signifier.position ??= 'right';
	}
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
	return null;
}

/** The open task and the done task always exist; their characters are fixed. */
const LOCKED_CHARS = new Set([' ', 'x']);

/** Entries that are complete and not duplicated; the rest are ignored until fixed. */
export function validBullets(settings: CustomBulletsSettings): BulletDef[] {
	return settings.bullets.filter((_, index) => bulletError(settings.bullets, index) === null);
}

export function validSignifiers(settings: CustomBulletsSettings): SignifierDef[] {
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
					.setWarning()
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

/** A row of column labels that shares the grid of the rows below it. */
function addHeaderRow(containerEl: HTMLElement, kind: 'bullets' | 'signifiers', labels: { text: string; span?: number }[]) {
	const row = new Setting(containerEl).setClass('custom-bullets-row').setClass(`custom-bullets-${kind}`).setClass('custom-bullets-header');
	for (const label of labels) {
		const el = row.controlEl.createSpan({ text: label.text });
		if (label.span) el.style.setProperty('grid-column', `span ${label.span}`);
	}
}

export class CustomBulletsSettingTab extends PluginSettingTab {
	plugin: CustomBulletsPlugin;

	constructor(app: App, plugin: CustomBulletsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;
		containerEl.empty();
		containerEl.addClass('custom-bullets-settings');

		new Setting(containerEl)
			.setName('Bullets')
			.setDesc('For each bullet: the character between the brackets, the symbol drawn in its place, the bullet color, and how the text of the line looks (color, strikethrough, underline, bold, italic).')
			.setHeading();

		addHeaderRow(containerEl, 'bullets', [
			{ text: 'Char' },
			{ text: 'Symbol' },
			{ text: 'Bullet color' },
			{ text: 'Text color' },
			{ text: 'Text style', span: 4 },
			{ text: '' },
		]);

		// Each row re-checks itself whenever any row changes, since a duplicate
		// depends on the rows above it.
		const refreshers: (() => void)[] = [];
		const refreshAll = () => refreshers.forEach((refresh) => refresh());

		settings.bullets.forEach((item, index) => {
			const locked = LOCKED_CHARS.has(item.char);
			const row = new Setting(containerEl).setClass('custom-bullets-row').setClass('custom-bullets-bullets');
			// Every row is labelled with what the user types, so the rows line up.
			const label = () => (item.char === '' ? 'New' : `- [${item.char}]`);
			// The reason a row is ignored goes on its own line under the row, so the columns stay put.
			const errorEl = row.settingEl.createDiv({ cls: 'custom-bullets-error' });
			refreshers.push(() => {
				const error = bulletError(settings.bullets, index);
				row.setName(label());
				errorEl.setText(error ?? '');
				row.settingEl.toggleClass('custom-bullets-invalid', error !== null);
			});
			row.addText((text) => {
				text.setPlaceholder(locked ? '' : 'Char')
					.setValue(item.char === ' ' ? '' : item.char)
					.setDisabled(locked)
					.onChange(async (value) => {
						item.char = value;
						refreshAll();
						await this.plugin.saveSettings();
					});
				text.inputEl.maxLength = 1;
				text.inputEl.addClass('custom-bullets-char');
				text.inputEl.setAttr('aria-label', 'Character between the brackets');
			});
			row.addText((text) => {
				text.setPlaceholder('Symbol')
					.setValue(item.symbol)
					.onChange(async (value) => {
						item.symbol = value;
						refreshAll();
						await this.plugin.saveSettings();
					});
				text.inputEl.maxLength = 2;
				text.inputEl.addClass('custom-bullets-char');
				text.inputEl.setAttr('aria-label', 'Symbol to draw');
			});
			row.addDropdown((dropdown) => {
				for (const [key, color] of Object.entries(COLORS)) dropdown.addOption(key, color.label);
				dropdown.setValue(item.color).onChange(async (value) => {
					item.color = value;
					await this.plugin.saveSettings();
				});
				dropdown.selectEl.setAttr('aria-label', 'Bullet color');
				dropdown.selectEl.title = 'Bullet color';
			});
			row.addDropdown((dropdown) => {
				dropdown.addOption(DEFAULT_TEXT_COLOR, 'Default');
				for (const [key, color] of Object.entries(COLORS)) dropdown.addOption(key, color.label);
				dropdown.setValue(item.textColor).onChange(async (value) => {
					item.textColor = value;
					await this.plugin.saveSettings();
				});
				dropdown.selectEl.setAttr('aria-label', 'Text color');
				dropdown.selectEl.title = 'Text color';
			});
			for (const style of TEXT_STYLES) {
				row.addExtraButton((button) => {
					button.setIcon(style.icon).setTooltip(style.label);
					const el = button.extraSettingsEl;
					el.addClass('custom-bullets-style-toggle');
					el.toggleClass('is-active', item[style.key]);
					button.onClick(async () => {
						item[style.key] = !item[style.key];
						el.toggleClass('is-active', item[style.key]);
						await this.plugin.saveSettings();
					});
				});
			}
			row.addExtraButton((button) =>
				button
					.setIcon('trash-2')
					.setTooltip('Remove')
					.setDisabled(locked)
					.onClick(async () => {
						settings.bullets.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		});

		refreshAll();

		new Setting(containerEl).addButton((button) =>
			button.setButtonText('Add bullet').onClick(async () => {
				settings.bullets.push(bullet('', ''));
				await this.plugin.saveSettings();
				this.display();
			}),
		);

		new Setting(containerEl)
			.setName('Signifiers')
			.setDesc('A character typed right after the checkbox, such as the asterisk in "- [ ] * text". It can be combined with any bullet, and drawn to the left of the bullet, on top of it, or to its right.')
			.setHeading();

		addHeaderRow(containerEl, 'signifiers', [
			{ text: 'Char' },
			{ text: 'Symbol' },
			{ text: 'Color' },
			{ text: 'Position' },
			{ text: '' },
		]);

		const signifierRefreshers: (() => void)[] = [];
		const refreshSignifiers = () => signifierRefreshers.forEach((refresh) => refresh());

		settings.signifiers.forEach((signifier, index) => {
			const row = new Setting(containerEl).setClass('custom-bullets-row').setClass('custom-bullets-signifiers');
			const label = () => (signifier.char === '' ? 'New' : `- [ ] ${signifier.char} text`);
			const errorEl = row.settingEl.createDiv({ cls: 'custom-bullets-error' });
			signifierRefreshers.push(() => {
				const error = signifierError(settings.signifiers, index);
				row.setName(label());
				errorEl.setText(error ?? '');
				row.settingEl.toggleClass('custom-bullets-invalid', error !== null);
			});
			row.addText((text) => {
				text.setPlaceholder('Char')
					.setValue(signifier.char)
					.onChange(async (value) => {
						signifier.char = value;
						refreshSignifiers();
						await this.plugin.saveSettings();
					});
				text.inputEl.maxLength = 1;
				text.inputEl.addClass('custom-bullets-char');
				text.inputEl.setAttr('aria-label', 'Signifier character');
			});
			row.addText((text) => {
				text.setPlaceholder('Symbol')
					.setValue(signifier.symbol ?? '')
					.onChange(async (value) => {
						signifier.symbol = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.maxLength = 2;
				text.inputEl.addClass('custom-bullets-char');
				text.inputEl.setAttr('aria-label', 'Symbol to draw');
			});
			row.addDropdown((dropdown) => {
				for (const [key, color] of Object.entries(COLORS)) dropdown.addOption(key, color.label);
				dropdown.setValue(signifier.color).onChange(async (value) => {
					signifier.color = value;
					await this.plugin.saveSettings();
				});
			});
			row.addDropdown((dropdown) => {
				dropdown
					.addOption('left', 'Left of bullet')
					.addOption('center', 'On the bullet')
					.addOption('right', 'Right of bullet')
					.setValue(signifier.position ?? 'right')
					.onChange(async (value) => {
						signifier.position = value as SignifierPosition;
						await this.plugin.saveSettings();
					});
				dropdown.selectEl.setAttr('aria-label', 'Position relative to the bullet');
			});
			row.addExtraButton((button) =>
				button
					.setIcon('trash-2')
					.setTooltip('Remove')
					.onClick(async () => {
						settings.signifiers.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		});

		refreshSignifiers();

		new Setting(containerEl).addButton((button) =>
			button.setButtonText('Add signifier').onClick(async () => {
				settings.signifiers.push({ char: '', symbol: '', color: 'text', position: 'right' });
				await this.plugin.saveSettings();
				this.display();
			}),
		);

		new Setting(containerEl)
			.setName('Reset to defaults')
			.setDesc('Restore the bullets and signifiers the plugin comes with. Your notes are not changed.')
			.addButton((button) =>
				button
					.setButtonText('Reset')
					.setWarning()
					.onClick(() => {
						new ResetConfirmModal(this.app, () => {
							void this.plugin.resetSettings().then(() => this.display());
						}).open();
					}),
			);
	}
}
