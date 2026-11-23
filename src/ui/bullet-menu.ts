import type OhMyBulletPlugin from '../main';
import { openMenuForCheckbox } from '../actions';

/** Right-click a bullet, or long-press it on a touch screen, to change it or its signifier. */
export function registerBulletMenu(plugin: OhMyBulletPlugin, document: Document) {
	// On a phone the checkbox sits in a label about twice its width, and a finger
	// lands on the label as often as on the checkbox itself.
	const checkboxOf = (target: EventTarget | null): HTMLElement | null => {
		// instanceOf, not instanceof: an element in a pop-out window belongs to another realm.
		const node = target as Node | null;
		if (!node || typeof node.instanceOf !== 'function' || !node.instanceOf(HTMLElement)) return null;
		if (node.matches('input.task-list-item-checkbox')) return node;
		return node.closest('label.task-list-label')?.querySelector<HTMLElement>('input.task-list-item-checkbox') ?? null;
	};

	// Obsidian turns a long press into a contextmenu event, so one handler serves
	// the mouse and the finger. (Opening the menu from a timer of our own, while the
	// finger is still down, does not work: lifting the finger dismisses the sheet.)
	let touching = false;
	// The checkbox whose menu the current press opened; lifting the finger must not toggle it.
	let held: HTMLElement | null = null;

	plugin.registerDomEvent(
		document,
		'contextmenu',
		(event) => {
			const checkbox = checkboxOf(event.target);
			if (!checkbox) return;
			if (openMenuForCheckbox(plugin.app, plugin.settings, checkbox, { x: event.clientX, y: event.clientY })) {
				event.preventDefault();
				event.stopPropagation();
				if (touching) held = checkbox;
			}
		},
		{ capture: true },
	);

	plugin.registerDomEvent(
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
	plugin.registerDomEvent(document, 'touchend', release, { capture: true, passive: true });
	plugin.registerDomEvent(document, 'touchcancel', release, { capture: true, passive: true });
	// A short tap or plain click: Obsidian would toggle the task. Whether it may is a setting.
	for (const type of ['mousedown', 'mouseup', 'click'] as const) {
		plugin.registerDomEvent(
			document,
			type,
			(event) => {
				const checkbox = checkboxOf(event.target);
				if (!checkbox || event.button !== 0) return;
				// Lifting the finger after a long press must never toggle, whatever the setting.
				const afterLongPress = held === checkbox;
				const action = plugin.settings.tapAction;
				if (!afterLongPress && action === 'toggle') return;
				event.preventDefault();
				event.stopPropagation();
				if (!afterLongPress && action === 'menu' && type === 'click') {
					openMenuForCheckbox(plugin.app, plugin.settings, checkbox, { x: event.clientX, y: event.clientY });
				}
			},
			{ capture: true },
		);
	}
}
