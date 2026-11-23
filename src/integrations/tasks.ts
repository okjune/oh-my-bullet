import type OhMyBulletPlugin from '../main';
import { createSignifierEl } from '../reading';
import { SIGNIFIER_CLASS, Signifier, buildLeadingTextRegex } from '../signifiers';
import { validSignifiers } from '../settings/defaults';

/**
 * The Tasks plugin renders the results of a query itself, so the reading view post
 * processor never sees them. Give the description of one result the same treatment.
 */
function decorateTasksPluginItem(li: HTMLElement, signifiers: Signifier[]) {
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

/**
 * The Tasks plugin draws its query results on its own, outside Markdown post
 * processing, and redraws them whenever a task changes. Watch for them so the
 * signifiers in those results are drawn too.
 */
export function watchTasksPlugin(plugin: OhMyBulletPlugin, doc: Document) {
	const ITEM = 'li.plugin-tasks-list-item';
	const win = doc.defaultView ?? window;
	const decorate = (roots: Iterable<HTMLElement>) => {
		const signifiers = validSignifiers(plugin.settings);
		for (const root of roots) {
			// It may have been taken out again before the frame came.
			if (!root.isConnected) continue;
			if (root.matches(ITEM)) decorateTasksPluginItem(root, signifiers);
			root.querySelectorAll<HTMLElement>(ITEM).forEach((li) => decorateTasksPluginItem(li, signifiers));
		}
	};

	// The whole window changes all the time: every keystroke and every scroll adds
	// elements. Rather than search each one as it comes, collect them and search
	// once a frame. The frame runs before the next paint, so nothing is seen undrawn.
	const pending = new Set<HTMLElement>();
	let frame: number | null = null;
	const flush = () => {
		frame = null;
		decorate(pending);
		pending.clear();
	};
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			mutation.addedNodes.forEach((node) => {
				if (node.instanceOf(HTMLElement)) pending.add(node);
			});
		}
		if (pending.size > 0 && frame === null) frame = win.requestAnimationFrame(flush);
	});
	observer.observe(doc.body, { childList: true, subtree: true });
	plugin.register(() => {
		observer.disconnect();
		if (frame !== null) win.cancelAnimationFrame(frame);
	});
	decorate([doc.body]);
}
