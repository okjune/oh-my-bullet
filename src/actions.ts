import { EditorView } from '@codemirror/view';
import { App, Editor, MarkdownPostProcessorContext, Menu, TFile } from 'obsidian';
import { BulletDef, CustomBulletsSettings, SignifierDef, validBullets, validSignifiers } from './settings';

const LIST_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s)/;
const TASK_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s\[)(.)(\]\s?)/;

function escapeRegex(char: string): string {
	return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The bullet character of a task line, or null when the line is not a task. */
export function bulletOf(line: string): string | null {
	return TASK_PREFIX.exec(line)?.[2] ?? null;
}

/** The signifier of a task line, or null when it has none. */
export function signifierOf(line: string, signifiers: SignifierDef[]): string | null {
	const match = TASK_PREFIX.exec(line);
	if (!match) return null;
	const next = line.slice(match[0].length);
	return signifiers.find((s) => next.startsWith(s.char + ' ') || next === s.char)?.char ?? null;
}

/**
 * Give a line the bullet `char`. A task changes its bullet, a plain list item
 * gains a checkbox, and any other line becomes a task.
 */
export function withBullet(line: string, char: string): string {
	if (TASK_PREFIX.test(line)) return line.replace(TASK_PREFIX, `$1${char}$3`);
	if (LIST_PREFIX.test(line)) return line.replace(LIST_PREFIX, `$1[${char}] `);
	const indent = /^\s*/.exec(line)?.[0] ?? '';
	return `${indent}- [${char}] ${line.slice(indent.length)}`;
}

/** Set the signifier of a task line, or remove it when `char` is null. Other lines are returned unchanged. */
export function withSignifier(line: string, char: string | null, signifiers: SignifierDef[]): string {
	const match = TASK_PREFIX.exec(line);
	if (!match) return line;
	const prefix = match[0].endsWith(' ') ? match[0] : match[0] + ' ';
	let rest = line.slice(match[0].length);
	const current = signifierOf(line, signifiers);
	if (current) rest = rest.replace(new RegExp(`^${escapeRegex(current)}\\s?`), '');
	return prefix + (char ? `${char} ` : '') + rest;
}

function bulletLabel(bullet: BulletDef): string {
	const name = bullet.meaning || `[${bullet.char}]`;
	return name.charAt(0).toUpperCase() + name.slice(1);
}

function signifierLabel(signifier: SignifierDef): string {
	const name = signifier.meaning || signifier.char;
	return `${signifier.symbol}  ${name.charAt(0).toUpperCase() + name.slice(1)}`;
}

/** The menu for one task line. `apply` receives a function that rewrites the line. */
export function buildBulletMenu(
	settings: CustomBulletsSettings,
	line: string,
	apply: (change: (line: string) => string) => void,
): Menu {
	const menu = new Menu();
	const bullets = validBullets(settings);
	const signifiers = validSignifiers(settings);
	const currentBullet = bulletOf(line);
	const currentSignifier = signifierOf(line, signifiers);

	for (const bullet of bullets) {
		menu.addItem((item) =>
			item
				.setTitle(bulletLabel(bullet))
				.setChecked(bullet.char === currentBullet)
				.onClick(() => apply((text) => withBullet(text, bullet.char))),
		);
	}
	if (signifiers.length > 0) {
		menu.addSeparator();
		for (const signifier of signifiers) {
			const active = signifier.char === currentSignifier;
			menu.addItem((item) =>
				item
					.setTitle(signifierLabel(signifier))
					.setChecked(active)
					// Choosing the active signifier again removes it.
					.onClick(() => apply((text) => withSignifier(text, active ? null : signifier.char, signifiers))),
			);
		}
	}
	return menu;
}

/** Apply a line change to every line the selection touches. */
export function changeSelectedLines(editor: Editor, change: (line: string) => string) {
	for (const selection of editor.listSelections()) {
		const from = Math.min(selection.anchor.line, selection.head.line);
		const to = Math.max(selection.anchor.line, selection.head.line);
		for (let n = from; n <= to; n++) {
			const before = editor.getLine(n);
			const after = change(before);
			if (after !== before) editor.setLine(n, after);
		}
	}
}

/** Where a reading-view checkbox comes from, so its source line can be found when it is clicked. */
export interface ReadingOrigin {
	ctx: MarkdownPostProcessorContext;
	section: HTMLElement;
	offset: number;
}

export const readingOrigins = new WeakMap<HTMLElement, ReadingOrigin>();

/**
 * Open the bullet menu for a right-clicked or long-pressed task checkbox, at `position`.
 * Returns false when the target is not one of ours, so the event is left alone.
 */
export function openMenuForCheckbox(
	app: App,
	settings: CustomBulletsSettings,
	checkbox: HTMLElement,
	position: { x: number; y: number },
): boolean {
	const editorEl = checkbox.closest<HTMLElement>('.cm-editor');
	if (editorEl) {
		// Only a checkbox that stands for its own source line. One inside an embedded block
		// (a Tasks query, an embed) maps to the block's line, which must not be rewritten;
		// leave those to whatever drew them.
		if (!checkbox.closest('.HyperMD-task-line') || checkbox.closest('.cm-embed-block, .cm-preview-code-block')) return false;
		const view = EditorView.findFromDOM(editorEl);
		if (!view) return false;
		const line = view.state.doc.lineAt(view.posAtDOM(checkbox));
		buildBulletMenu(settings, line.text, (change) => {
			// Look the line up again: the document may have changed while the menu was open.
			const current = view.state.doc.lineAt(Math.min(line.from, view.state.doc.length));
			const next = change(current.text);
			if (next !== current.text) view.dispatch({ changes: { from: current.from, to: current.to, insert: next } });
		}).showAtPosition(position, checkbox.ownerDocument);
		return true;
	}

	const origin = readingOrigins.get(checkbox);
	if (!origin) return false;
	const info = origin.ctx.getSectionInfo(origin.section);
	const file = app.vault.getAbstractFileByPath(origin.ctx.sourcePath);
	if (!info || !(file instanceof TFile)) return false;
	const lineNumber = info.lineStart + origin.offset;
	const text = info.text.split('\n')[lineNumber] ?? '';
	if (bulletOf(text) === null) return false;
	buildBulletMenu(settings, text, (change) => {
		void app.vault.process(file, (data) => {
			const lines = data.split('\n');
			// Only touch the line if it is still the one the menu was opened for.
			if (lines[lineNumber] !== text) return data;
			lines[lineNumber] = change(text);
			return lines.join('\n');
		});
	}).showAtPosition(position, checkbox.ownerDocument);
	return true;
}
