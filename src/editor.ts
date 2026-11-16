import { syntaxTree } from '@codemirror/language';
import { Prec, Range } from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import { SIGNIFIER_ATTR, SIGNIFIER_CLASS, Signifier, buildTaskLineRegex } from './signifiers';

/** The symbol shown in place of the raw signifier character. */
class SignifierWidget extends WidgetType {
	constructor(
		readonly char: string,
		readonly symbol: string,
	) {
		super();
	}

	eq(other: SignifierWidget): boolean {
		return other.char === this.char && other.symbol === this.symbol;
	}

	toDOM(view: EditorView): HTMLElement {
		// Built in the editor's own document, which is not the main one in a pop-out window.
		// Obsidian gives every window its own DOM helpers; the typings declare them on the main one.
		const win = view.dom.win as typeof window;
		const span = win.createSpan({ cls: SIGNIFIER_CLASS, text: this.symbol });
		span.dataset.signifier = this.char;
		return span;
	}
}

function isInsideCode(view: EditorView, pos: number): boolean {
	const name = syntaxTree(view.state).resolveInner(pos, 1).name.toLowerCase();
	return name.includes('codeblock') || name.includes('code-block') || name.includes('inline-code');
}

function cursorTouches(view: EditorView, from: number, to: number): boolean {
	return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function buildDecorations(view: EditorView, signifiers: Signifier[]): DecorationSet {
	const taskLine = buildTaskLineRegex(signifiers);
	if (!taskLine) return Decoration.none;
	const decorations: Range<Decoration>[] = [];

	for (const { from, to } of view.visibleRanges) {
		let pos = from;
		while (pos <= to) {
			const line = view.state.doc.lineAt(pos);
			pos = line.to + 1;
			const match = taskLine.exec(line.text);
			if (!match) continue;
			const start = line.from + (match[1] ?? '').length;
			const char = match[2] ?? '';
			if (isInsideCode(view, start)) continue;

			const signifier = signifiers.find((s) => s.char === char);
			const position = signifier?.position ?? 'right';
			const symbol = signifier?.symbol ?? char;
			// Like the rest of Live Preview: reveal the raw character only while the cursor
			// is on it, not whenever the cursor is somewhere on the line.
			const editing = cursorTouches(view, start, start + char.length);
			// While the cursor is on the character, show it as plain source text,
			// the same way Obsidian reveals `- [ ]` for a checkbox.
			if (editing) continue;

			if (position === 'right') {
				if (symbol === char) {
					decorations.push(
						Decoration.mark({
							class: SIGNIFIER_CLASS,
							attributes: { 'data-signifier': char },
						}).range(start, start + char.length),
					);
				} else {
					decorations.push(
						Decoration.replace({ widget: new SignifierWidget(char, symbol) }).range(start, start + char.length),
					);
				}
				continue;
			}

			// Left and center: the bullet draws the signifier, so tag the line
			// and hide the character together with the space after it.
			decorations.push(Decoration.line({ attributes: { [SIGNIFIER_ATTR]: char } }).range(line.from));
			const end = Math.min(start + char.length + 1, line.to);
			decorations.push(Decoration.replace({}).range(start, end));
		}
	}
	return Decoration.set(decorations, true);
}

export function createEditorExtension(getSignifiers: () => Signifier[]) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, getSignifiers());
			}

			update(update: ViewUpdate) {
				// A settings change reconfigures the editor, which arrives as a reconfigured transaction.
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					update.transactions.some((tr) => tr.reconfigured)
				) {
					this.decorations = buildDecorations(update.view, getSignifiers());
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

/**
 * Obsidian auto-pairs Markdown characters, so typing `*` inserts `**`.
 * Right after a checkbox the character is a signifier, not the start of
 * emphasis, so insert it alone.
 */
export function createSignifierInputHandler(getSignifiers: () => Signifier[]) {
	const afterCheckbox = /^\s*(?:[-*+]|\d+[.)])\s\[.\]\s$/;
	return Prec.highest(
		EditorView.inputHandler.of((view, from, to, text) => {
			if (from !== to || text.length !== 1) return false;
			if (!getSignifiers().some((s) => s.char === text)) return false;
			const line = view.state.doc.lineAt(from);
			if (!afterCheckbox.test(line.text.slice(0, from - line.from))) return false;
			if (isInsideCode(view, from)) return false;
			view.dispatch({
				changes: { from, to, insert: text },
				selection: { anchor: from + text.length },
				userEvent: 'input.type',
			});
			return true;
		}),
	);
}
