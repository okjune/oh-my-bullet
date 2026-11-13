import { Modal, Plugin, Setting, TFile, debounce } from 'obsidian';
import { buildDynamicCss } from './dynamic-styles';
import { createEditorExtension, createSignifierInputHandler } from './editor';
import { syncAgentLegend, syncNoteLegend } from './legend';
import { createReadingProcessor } from './reading';
import {
	CustomBulletsSettingTab,
	CustomBulletsSettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
	validSignifiers,
} from './settings';

export default class CustomBulletsPlugin extends Plugin {
	settings: CustomBulletsSettings = DEFAULT_SETTINGS;
	// A constructed stylesheet holds the rules generated from the settings.
	private sheet: CSSStyleSheet | null = null;

	async onload() {
		await this.loadSettings();

		const sheet = new CSSStyleSheet();
		this.sheet = sheet;
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
		this.register(() => {
			document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
		});
		this.applyStyles();

		const getSignifiers = () => validSignifiers(this.settings);
		this.registerMarkdownPostProcessor(createReadingProcessor(getSignifiers));
		this.registerEditorExtension(createEditorExtension(getSignifiers));
		this.registerEditorExtension(createSignifierInputHandler(getSignifiers));

		this.addSettingTab(new CustomBulletsSettingTab(this.app, this));

		// Method B: when the user leaves a note, bring its legend property up to date.
		let previous: TFile | null = this.app.workspace.getActiveFile();
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				const left = previous;
				previous = file;
				// Runs even when the option is off, so a legend written earlier gets removed.
				if (left && left !== file) void syncNoteLegend(this.app, left, this.settings);
			}),
		);
		this.addCommand({
			id: 'update-note-legend',
			name: 'Update the legend in this note',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void syncNoteLegend(this.app, file, this.settings);
				return true;
			},
		});

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.agentLegend === 'ask') this.askAboutAgentLegend();
			else if (this.settings.agentLegend === 'on') this.syncLegend();
		});
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<CustomBulletsSettings> | null;
		// Copy the defaults so editing the settings never mutates DEFAULT_SETTINGS.
		this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(saved ?? {}) };
		normalizeSettings(this.settings);
	}

	/** Rewriting the agent files on every keystroke in the settings would be wasteful. */
	private syncLegend = debounce(() => void syncAgentLegend(this.app, this.settings), 800, true);

	/** Asked once, on first run: writing into the vault is the user's call. */
	private askAboutAgentLegend() {
		const answer = async (mode: 'on' | 'off') => {
			this.settings.agentLegend = mode;
			await this.saveSettings();
		};
		const modal = new Modal(this.app);
		modal.setTitle('Explain your bullets to AI agents?');
		modal.contentEl.createEl('p', {
			text: 'AI agents read the raw text of your notes, so they cannot see what a bullet such as "- [>]" means. Custom Bullets can keep a short legend in AGENTS.md (and CLAUDE.md, if you have one) at the top of this vault. You can change this later in the settings.',
		});
		new Setting(modal.contentEl)
			.addButton((button) =>
				button.setButtonText('Not now').onClick(() => {
					modal.close();
					void answer('off');
				}),
			)
			.addButton((button) =>
				button
					.setButtonText('Add the legend')
					.setCta()
					.onClick(() => {
						modal.close();
						void answer('on');
					}),
			);
		modal.open();
	}

	/** Back to what a fresh install has. */
	async resetSettings() {
		// The legend choice is about the vault, not about how bullets look; keep it.
		const { agentLegend, noteLegend } = this.settings;
		this.settings = { ...structuredClone(DEFAULT_SETTINGS), agentLegend, noteLegend };
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyStyles();
		// Make open editors rebuild their signifier decorations.
		this.app.workspace.updateOptions();
		// 'ask' means the user has not decided yet, so nothing is written or removed.
		if (this.settings.agentLegend !== 'ask') this.syncLegend();
	}

	private applyStyles() {
		this.sheet?.replaceSync(buildDynamicCss(this.settings));
	}
}
