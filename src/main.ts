import { Plugin, TFile, debounce } from 'obsidian';
import { registerCommands } from './commands';
import { buildDynamicCss } from './dynamic-styles';
import { createEditorExtension, createSignifierInputHandler } from './editor';
import { watchTasksPlugin } from './integrations/tasks';
import { syncAgentLegend, syncNoteLegend } from './legend';
import { createReadingProcessor } from './reading';
import { DEFAULT_SETTINGS, OhMyBulletSettings, normalizeSettings, validSignifiers } from './settings/defaults';
import { OhMyBulletSettingTab } from './settings/tab';
import { askAboutAgentLegend } from './ui/agent-legend-modal';
import { registerBulletMenu } from './ui/bullet-menu';

export default class OhMyBulletPlugin extends Plugin {
	settings: OhMyBulletSettings = DEFAULT_SETTINGS;
	// The rules generated from the settings live in a constructed stylesheet. A pop-out
	// window is a document of its own and needs its own copy, so there is one per window.
	private sheets = new Map<Document, CSSStyleSheet>();
	/** Brings the per-bullet and per-signifier commands up to date; set once they are registered. */
	private refreshCommands: () => void = () => {};

	async onload() {
		await this.loadSettings();

		this.attachWindow(window);
		this.registerEvent(this.app.workspace.on('window-open', (_, win) => this.attachWindow(win)));
		this.registerEvent(this.app.workspace.on('window-close', (_, win) => this.sheets.delete(win.document)));
		// Pop-out windows that were already open when the plugin was switched on.
		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.iterateAllLeaves((leaf) => {
				const win = leaf.view.containerEl.ownerDocument.defaultView;
				if (win) this.attachWindow(win);
			});
		});

		const getSignifiers = () => validSignifiers(this.settings);
		this.registerMarkdownPostProcessor(createReadingProcessor(getSignifiers));
		this.registerEditorExtension(createEditorExtension(getSignifiers));
		this.registerEditorExtension(createSignifierInputHandler(getSignifiers));

		this.addSettingTab(new OhMyBulletSettingTab(this.app, this));

		this.refreshCommands = registerCommands(this);

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

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.agentLegend === 'ask') askAboutAgentLegend(this);
			else if (this.settings.agentLegend === 'on') this.syncLegend();
		});
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<OhMyBulletSettings> | null;
		// Copy the defaults so editing the settings never mutates DEFAULT_SETTINGS.
		this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(saved ?? {}) };
		normalizeSettings(this.settings);
	}

	/** Give one window its stylesheet and its bullet handlers. Safe to call twice for the same window. */
	attachWindow(win: Window) {
		const doc = win.document;
		if (this.sheets.has(doc)) return;
		// A stylesheet can only be adopted by the document of the window that constructed it.
		const sheet = new (win as Window & { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet();
		sheet.replaceSync(buildDynamicCss(this.settings));
		doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
		this.sheets.set(doc, sheet);
		this.register(() => {
			doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
		});
		registerBulletMenu(this, doc);
		watchTasksPlugin(this, doc);
	}

	/** Rewriting the agent files on every keystroke in the settings would be wasteful. */
	private syncLegend = debounce(() => void syncAgentLegend(this.app, this.settings), 800, true);

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
		this.refreshCommands();
		// 'ask' means the user has not decided yet, so nothing is written or removed.
		if (this.settings.agentLegend !== 'ask') this.syncLegend();
	}

	private applyStyles() {
		const css = buildDynamicCss(this.settings);
		for (const sheet of this.sheets.values()) sheet.replaceSync(css);
	}
}
