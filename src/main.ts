import { Editor, MarkdownView, Modal, Plugin, Setting, TFile, debounce } from 'obsidian';
import { EditorView } from '@codemirror/view';
import {
	buildBulletMenu,
	changeSelectedLines,
	openMenuForCheckbox,
	signifierOf,
	withBullet,
	withSignifier,
} from './actions';
import { buildDynamicCss } from './dynamic-styles';
import { createEditorExtension, createSignifierInputHandler } from './editor';
import { syncAgentLegend, syncNoteLegend } from './legend';
import { createReadingProcessor } from './reading';
import {
	CustomBulletsSettingTab,
	CustomBulletsSettings,
	DEFAULT_SETTINGS,
	normalizeSettings,
	validBullets,
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

		this.registerBulletMenu();
		this.registerCommands();

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

	/** Right-click a bullet, or long-press it on a touch screen, to change it or its signifier. */
	private registerBulletMenu() {
		// On a phone the checkbox sits in a label about twice its width, and a finger
		// lands on the label as often as on the checkbox itself.
		const checkboxOf = (target: EventTarget | null): HTMLElement | null => {
			if (!(target instanceof HTMLElement)) return null;
			if (target.matches('input.task-list-item-checkbox')) return target;
			return target.closest('label.task-list-label')?.querySelector<HTMLElement>('input.task-list-item-checkbox') ?? null;
		};

		// Obsidian turns a long press into a contextmenu event, so one handler serves
		// the mouse and the finger. (Opening the menu from a timer of our own, while the
		// finger is still down, does not work: lifting the finger dismisses the sheet.)
		let touching = false;
		// The checkbox whose menu the current press opened; lifting the finger must not toggle it.
		let held: HTMLElement | null = null;

		this.registerDomEvent(
			document,
			'contextmenu',
			(event) => {
				const checkbox = checkboxOf(event.target);
				if (!checkbox) return;
				if (openMenuForCheckbox(this.app, this.settings, checkbox, { x: event.clientX, y: event.clientY })) {
					event.preventDefault();
					event.stopPropagation();
					if (touching) held = checkbox;
				}
			},
			{ capture: true },
		);

		this.registerDomEvent(
			document,
			'touchstart',
			() => {
				touching = true;
				held = null;
			},
			{ capture: true, passive: true },
		);
		const release = () => {
			touching = false;
			// The tap that follows a release arrives a moment later; forget the press after it.
			window.setTimeout(() => (held = null), 600);
		};
		this.registerDomEvent(document, 'touchend', release, { capture: true, passive: true });
		this.registerDomEvent(document, 'touchcancel', release, { capture: true, passive: true });
		// A short tap or plain click: Obsidian would toggle the task. Whether it may is a setting.
		for (const type of ['mousedown', 'mouseup', 'click'] as const) {
			this.registerDomEvent(
				document,
				type,
				(event) => {
					const checkbox = checkboxOf(event.target);
					if (!checkbox || event.button !== 0) return;
					// Lifting the finger after a long press must never toggle, whatever the setting.
					const afterLongPress = held === checkbox;
					const action = this.settings.tapAction;
					if (!afterLongPress && action === 'toggle') return;
					event.preventDefault();
					event.stopPropagation();
					if (!afterLongPress && action === 'menu' && type === 'click') {
						openMenuForCheckbox(this.app, this.settings, checkbox, { x: event.clientX, y: event.clientY });
					}
				},
				{ capture: true },
			);
		}
	}

	/**
	 * One command per bullet and per signifier, so each can have a hotkey.
	 * Ids come from the character, so a hotkey survives a change of meaning.
	 * Called again after the settings change; an existing id is replaced.
	 */
	private registerCommands() {
		const label = (text: string, fallback: string) => text || fallback;
		// Commands that need an editor look it up themselves instead of using editorCallback:
		// the mobile toolbar's command picker opens over the settings, where no editor has
		// focus, and it leaves editorCallback commands out of its list.
		const inEditor = (run: (editor: Editor, view: MarkdownView) => void) => (checking: boolean) => {
			// Stay available whenever a note is open, even while a settings screen covers it.
			if (checking) return this.app.workspace.getActiveFile() !== null;
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.getMode() === 'source') run(view.editor, view);
			return true;
		};

		// The menu without having to hit the bullet: for a hotkey, or a button on the mobile toolbar.
		this.addCommand({
			id: 'choose-bullet',
			name: 'Choose a bullet for this line',
			icon: 'list-checks',
			checkCallback: inEditor((editor, ctx) => {
				const cursor = editor.getCursor();
				const menu = buildBulletMenu(this.settings, editor.getLine(cursor.line), (change) =>
					changeSelectedLines(editor, change),
				);
				// Open it at the cursor; a phone shows a sheet at the bottom whatever the position.
				const editorEl = ctx.contentEl.querySelector<HTMLElement>('.cm-editor');
				const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
				const coords = view?.coordsAtPos(editor.posToOffset(cursor));
				menu.showAtPosition(
					coords ? { x: coords.left, y: coords.bottom } : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
				);
			}),
		});
		for (const bullet of validBullets(this.settings)) {
			this.addCommand({
				id: `set-bullet-${bullet.char.codePointAt(0)}`,
				name: `Set bullet: ${label(bullet.meaning, `[${bullet.char}]`)}`,
				checkCallback: inEditor((editor) => changeSelectedLines(editor, (line) => withBullet(line, bullet.char))),
			});
		}
		for (const signifier of validSignifiers(this.settings)) {
			this.addCommand({
				id: `toggle-signifier-${signifier.char.codePointAt(0)}`,
				name: `Toggle signifier: ${label(signifier.meaning, signifier.char)}`,
				checkCallback: inEditor((editor) => {
					const signifiers = validSignifiers(this.settings);
					changeSelectedLines(editor, (line) =>
						withSignifier(line, signifierOf(line, signifiers) === signifier.char ? null : signifier.char, signifiers),
					);
				}),
			});
		}
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
		this.registerCommands();
		// 'ask' means the user has not decided yet, so nothing is written or removed.
		if (this.settings.agentLegend !== 'ask') this.syncLegend();
	}

	private applyStyles() {
		this.sheet?.replaceSync(buildDynamicCss(this.settings));
	}
}
