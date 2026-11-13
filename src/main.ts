import { Plugin } from 'obsidian';
import { buildDynamicCss } from './dynamic-styles';
import { createEditorExtension, createSignifierInputHandler } from './editor';
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
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<CustomBulletsSettings> | null;
		// Copy the defaults so editing the settings never mutates DEFAULT_SETTINGS.
		this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(saved ?? {}) };
		normalizeSettings(this.settings);
	}

	/** Back to what a fresh install has. */
	async resetSettings() {
		this.settings = structuredClone(DEFAULT_SETTINGS);
		await this.saveSettings();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyStyles();
		// Make open editors rebuild their signifier decorations.
		this.app.workspace.updateOptions();
	}

	private applyStyles() {
		this.sheet?.replaceSync(buildDynamicCss(this.settings));
	}
}
