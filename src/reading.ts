import { MarkdownPostProcessorContext } from 'obsidian';
import { readingOrigins } from './actions';
import {
	SIGNIFIER_ATTR,
	SIGNIFIER_CLASS,
	SIGNIFIER_HIDDEN_CLASS,
	Signifier,
	buildLeadingTextRegex,
	buildTaskLineRegex,
} from './signifiers';

function createSignifierEl(char: string, signifiers: Signifier[]): HTMLElement {
	const symbol = signifiers.find((s) => s.char === char)?.symbol ?? char;
	const span = createSpan({ cls: SIGNIFIER_CLASS, text: symbol });
	span.dataset.signifier = char;
	return span;
}

function findCheckbox(li: HTMLElement): HTMLInputElement | null {
	for (const child of Array.from(li.children)) {
		if (child.instanceOf(HTMLInputElement) && child.type === 'checkbox') return child;
		if (child.instanceOf(HTMLParagraphElement)) {
			const first = child.querySelector(':scope > input[type="checkbox"]');
			if (first instanceof HTMLInputElement) return first;
		}
	}
	return null;
}

/** The first node after the checkbox that is not empty whitespace. */
function nextMeaningfulSibling(node: Node): Node | null {
	let next = node.nextSibling;
	while (next && next.nodeType === Node.TEXT_NODE && (next.textContent ?? '').trim() === '') {
		next = next.nextSibling;
	}
	return next;
}

/**
 * `- [ ] ! text` renders as a checkbox followed by the text "! text".
 * Wrap the leading signifier in a span.
 */
function markLeadingText(checkbox: HTMLInputElement, leadingText: RegExp, signifiers: Signifier[]): boolean {
	const next = nextMeaningfulSibling(checkbox);
	if (!next || next.nodeType !== Node.TEXT_NODE) return false;
	const text = next.textContent ?? '';
	const match = leadingText.exec(text);
	if (!match) return false;
	const char = match[2] ?? '';
	next.textContent = (match[3] ?? ' ') + text.slice(match[0].length);
	next.parentNode?.insertBefore(createSignifierEl(char, signifiers), next);
	return true;
}

/**
 * `- [ ] * text` renders as a task whose only content is a nested one-item list,
 * because `* ` (and `+ `, `- `) is a list marker. Flatten it back into one line.
 */
function flattenNestedList(li: HTMLElement, checkbox: HTMLInputElement, char: string, signifiers: Signifier[]): boolean {
	const next = nextMeaningfulSibling(checkbox);
	if (!(next instanceof HTMLUListElement) || next.parentElement !== li) return false;
	if (next.children.length !== 1) return false;
	const inner = next.children[0];
	if (!(inner instanceof HTMLLIElement) || inner.hasAttribute('data-task')) return false;

	const fragment = createFragment();
	fragment.append(createSignifierEl(char, signifiers), ' ');
	for (const node of Array.from(inner.childNodes)) {
		if (node.instanceOf(HTMLElement) && (node.hasClass('list-bullet') || node.hasClass('list-collapse-indicator'))) {
			continue;
		}
		fragment.append(node);
	}
	// Drop the line break markdown left between the checkbox and the nested list.
	let gap = checkbox.nextSibling;
	while (gap && gap !== next) {
		const following = gap.nextSibling;
		gap.remove();
		gap = following;
	}
	next.replaceWith(fragment);
	// The parent only looked collapsible because of the nested list we just removed.
	if (!li.querySelector('ul, ol')) {
		li.querySelector(':scope > .list-collapse-indicator')?.remove();
	}
	return true;
}

/**
 * Left and center signifiers are drawn from the checkbox instead:
 * tag the list item and hide the inline copy together with its trailing space.
 */
function moveToBullet(li: HTMLElement, signifiers: Signifier[]) {
	const span = li.querySelector<HTMLElement>(`:scope > .${SIGNIFIER_CLASS}, :scope > p > .${SIGNIFIER_CLASS}`);
	if (!span) return;
	const char = span.dataset.signifier ?? '';
	const position = signifiers.find((s) => s.char === char)?.position ?? 'right';
	if (position === 'right') return;
	li.setAttribute(SIGNIFIER_ATTR, char);
	span.addClass(SIGNIFIER_HIDDEN_CLASS);
	const next = span.nextSibling;
	if (next && next.nodeType === Node.TEXT_NODE) {
		next.textContent = (next.textContent ?? '').replace(/^\s/, '');
	}
}

export function createReadingProcessor(getSignifiers: () => Signifier[]) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const signifiers = getSignifiers();
		const taskLine = buildTaskLineRegex(signifiers);
		const leadingText = buildLeadingTextRegex(signifiers);

		const items = el.querySelectorAll<HTMLElement>('li.task-list-item');
		if (items.length === 0) return;

		const section = ctx.getSectionInfo(el);
		const lines = section ? section.text.split('\n') : null;

		items.forEach((li) => {
			const checkbox = findCheckbox(li);
			if (!checkbox) return;
			// Remember where this checkbox comes from, for the right-click menu.
			const lineOffset = Number(li.dataset.line);
			if (!Number.isNaN(lineOffset)) readingOrigins.set(checkbox, { ctx, section: el, offset: lineOffset });

			if (!taskLine || !leadingText) return;
			if (li.querySelector(`:scope > .${SIGNIFIER_CLASS}, :scope > p > .${SIGNIFIER_CLASS}`)) return;
			if (markLeadingText(checkbox, leadingText, signifiers)) {
				moveToBullet(li, signifiers);
				return;
			}

			// The nested-list case is only safe to rewrite when the source line confirms it.
			if (!section || !lines) return;
			const offset = Number(li.dataset.line);
			if (Number.isNaN(offset)) return;
			const source = lines[section.lineStart + offset] ?? '';
			const match = taskLine.exec(source);
			if (!match) return;
			if (flattenNestedList(li, checkbox, match[2] ?? '', signifiers)) moveToBullet(li, signifiers);
		});
	};
}

/**
 * The Tasks plugin renders the results of a query itself, so the post processor above
 * never sees them. Give the description of one result the same treatment.
 */
export function decorateTasksPluginItem(li: HTMLElement, signifiers: Signifier[]) {
	const holder = li.querySelector<HTMLElement>('.task-description > span');
	if (!holder || holder.querySelector(`.${SIGNIFIER_CLASS}`)) return;
	const leadingText = buildLeadingTextRegex(signifiers);
	if (!leadingText) return;

	const first = holder.firstChild;
	if (first && first.nodeType === Node.TEXT_NODE) {
		const text = first.textContent ?? '';
		const match = leadingText.exec(text);
		if (!match) return;
		first.textContent = (match[3] ?? ' ') + text.slice(match[0].length);
		holder.insertBefore(createSignifierEl(match[2] ?? '', signifiers), first);
		return;
	}

	// `* text` came out as a one-item list. The marker is gone from the DOM, so this is
	// only safe when exactly one signifier is a list marker.
	const markers = signifiers.filter((s) => s.char === '*' || s.char === '-' || s.char === '+');
	const list = holder.firstElementChild;
	if (markers.length !== 1 || !list || !list.instanceOf(HTMLUListElement)) return;
	if (holder.children.length !== 1 || list.children.length !== 1) return;
	const inner = list.children[0];
	if (!inner || inner.querySelector('input')) return;
	const fragment = createFragment();
	fragment.append(createSignifierEl(markers[0]?.char ?? '*', signifiers), ' ');
	fragment.append(...Array.from(inner.childNodes));
	list.replaceWith(fragment);
}
