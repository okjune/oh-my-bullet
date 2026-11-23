import { EditorView } from '@codemirror/view';
import { Editor, MarkdownView } from 'obsidian';
import type OhMyBulletPlugin from './main';
import { buildBulletMenu, changeSelectedLines, signifierOf, withBullet, withSignifier } from './actions';
import { syncNoteLegend } from './legend';
import { validBullets, validSignifiers } from './settings/defaults';

/**
 * Register the plugin's commands. Returns a function to call after the settings change,
 * which brings the per-bullet and per-signifier commands up to date.
 */
export function registerCommands(plugin: OhMyBulletPlugin): () => void {
	const label = (text: string, fallback: string) => text || fallback;
	// Commands that need an editor look it up themselves instead of using editorCallback:
	// the mobile toolbar's command picker opens over the settings, where no editor has
	// focus, and it leaves editorCallback commands out of its list.
	const inEditor = (run: (editor: Editor, view: MarkdownView) => void) => (checking: boolean) => {
		// Stay available whenever a note is open, even while a settings screen covers it.
		if (checking) return plugin.app.workspace.getActiveFile() !== null;
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.getMode() === 'source') run(view.editor, view);
		return true;
	};

	// The menu without having to hit the bullet: for a hotkey, or a button on the mobile toolbar.
	plugin.addCommand({
		id: 'choose-bullet',
		name: 'Choose a bullet for this line',
		icon: 'list-checks',
		checkCallback: inEditor((editor, ctx) => {
			const cursor = editor.getCursor();
			const menu = buildBulletMenu(plugin.settings, editor.getLine(cursor.line), (change) =>
				changeSelectedLines(editor, change),
			);
			// Open it at the cursor; a phone shows a sheet at the bottom whatever the position.
			const editorEl = ctx.contentEl.querySelector<HTMLElement>('.cm-editor');
			const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
			const coords = view?.coordsAtPos(editor.posToOffset(cursor));
			const doc = ctx.contentEl.ownerDocument;
			const win = doc.defaultView ?? window;
			menu.showAtPosition(
				coords ? { x: coords.left, y: coords.bottom } : { x: win.innerWidth / 2, y: win.innerHeight / 2 },
				doc,
			);
		}),
	});

	plugin.addCommand({
		id: 'update-note-legend',
		name: 'Update the legend in this note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) return false;
			if (!checking) void syncNoteLegend(plugin.app, file, plugin.settings);
			return true;
		},
	});

	// Ids of the per-bullet and per-signifier commands registered last time, so the ones
	// whose bullet or signifier is gone can be removed.
	let registered = new Set<string>();

	/**
	 * One command per bullet and per signifier, so each can have a hotkey.
	 * Ids come from the character, so a hotkey survives a change of meaning.
	 * Called again after the settings change; an existing id is replaced, and the command
	 * of a bullet or signifier that was removed, or whose character changed, is removed.
	 */
	const refresh = () => {
		const ids = new Set<string>();
		for (const bullet of validBullets(plugin.settings)) {
			const id = `set-bullet-${bullet.char.codePointAt(0)}`;
			ids.add(id);
			plugin.addCommand({
				id,
				name: `Set bullet: ${label(bullet.meaning, `[${bullet.char}]`)}`,
				checkCallback: inEditor((editor) => changeSelectedLines(editor, (line) => withBullet(line, bullet.char))),
			});
		}
		for (const signifier of validSignifiers(plugin.settings)) {
			const id = `toggle-signifier-${signifier.char.codePointAt(0)}`;
			ids.add(id);
			plugin.addCommand({
				id,
				name: `Toggle signifier: ${label(signifier.meaning, signifier.char)}`,
				checkCallback: inEditor((editor) => {
					const signifiers = validSignifiers(plugin.settings);
					changeSelectedLines(editor, (line) =>
						withSignifier(line, signifierOf(line, signifiers) === signifier.char ? null : signifier.char, signifiers),
					);
				}),
			});
		}
		for (const id of registered) {
			if (!ids.has(id)) plugin.removeCommand(id);
		}
		registered = ids;
	};

	refresh();
	return refresh;
}
