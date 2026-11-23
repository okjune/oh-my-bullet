import { App, Notice, Platform, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import type OhMyBulletPlugin from '../main';
import { ResetConfirmModal } from '../ui/reset-modal';
import { LOCKED_CHARS, bullet } from './defaults';
import { bulletPage, signifierPage } from './item-pages';
import { PREVIEW_LINES_CLASS, PreviewLine, fillPreview, overviewLines } from './preview';

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
				const el = setting.settingEl.createDiv({ cls: `${PREVIEW_LINES_CLASS} markdown-rendered show-indentation-guide` });
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const { settings } = this.plugin;
		const mobile = Platform.isMobile;
		const save = async () => {
			await this.plugin.saveSettings();
			this.update();
		};

		return [
			this.previewRow(() => overviewLines(this.plugin.settings)),
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
				items: settings.bullets.map((_, index) => bulletPage(this.plugin, (lines) => this.previewRow(lines), index)),
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
				items: settings.signifiers.map((_, index) => signifierPage(this.plugin, (lines) => this.previewRow(lines), index)),
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
