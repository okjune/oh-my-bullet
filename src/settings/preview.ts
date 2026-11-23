import { SIGNIFIER_ATTR, SIGNIFIER_CLASS, SIGNIFIER_HIDDEN_CLASS } from '../signifiers';
import { BulletDef, OhMyBulletSettings, SignifierDef, validBullets, validSignifiers } from './defaults';

/** The sample lines in the settings. */
export const PREVIEW_LINES_CLASS = 'oh-my-bullet-preview-lines';

/** One line of a preview: a bullet, optionally with a signifier, and some text. */
export interface PreviewLine {
	bullet: BulletDef;
	signifier?: SignifierDef;
	text: string;
	children?: PreviewLine[];
}

/** A line of the sample day, before it is matched against the user's bullets. */
interface SampleLine {
	char: string;
	signifier?: string;
	text: string;
	children?: SampleLine[];
}

/**
 * The overview preview: a day's log as someone might actually keep it, with
 * sub-tasks, so the bullets are seen doing their job rather than listed.
 */
const SAMPLE_DAY: SampleLine[] = [
	{ char: 'O', text: 'Morning standup' },
	{ char: 'x', text: 'Reply to Mina about the budget' },
	{
		char: '/',
		text: 'Draft the quarterly report',
		children: [
			{ char: 'x', text: 'Pull last quarter\'s numbers' },
			{ char: ' ', signifier: '*', text: 'Write the summary' },
			{ char: '-', text: 'Redo the charts in the old template' },
		],
	},
	{ char: ' ', text: 'Call the landlord about the heating' },
	{ char: '>', text: 'Renew passport' },
	{ char: '<', text: 'Book the dentist' },
	{ char: ' ', signifier: '!', text: 'Try a weekly review on Fridays' },
	{ char: 'o', text: 'Team dinner at 7pm' },
];

/** What a bullet's own page shows, when the sample day has a line for it. */
export function sampleTextFor(char: string): string | undefined {
	const find = (lines: SampleLine[]): string | undefined => {
		for (const line of lines) {
			if (line.char === char && !line.signifier) return line.text;
			const inner = line.children ? find(line.children) : undefined;
			if (inner) return inner;
		}
		return undefined;
	};
	return find(SAMPLE_DAY);
}

export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Draw sample task lines with the same markup a note has in reading view, so the
 * rules generated from the settings style them. What you see is what the notes get.
 */
export function fillPreview(el: HTMLElement, lines: PreviewLine[]) {
	el.empty();
	appendPreviewList(el, lines);
}

function appendPreviewList(parent: HTMLElement, lines: PreviewLine[]) {
	const list = parent.createEl('ul', { cls: 'contains-task-list has-list-bullet' });
	for (const line of lines) {
		const li = list.createEl('li', { cls: 'task-list-item' });
		// Reading view marks the open task with an empty data-task.
		li.dataset.task = line.bullet.char === ' ' ? '' : line.bullet.char;
		const checkbox = li.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
		checkbox.checked = line.bullet.char !== ' ';
		checkbox.tabIndex = -1;
		if (line.signifier) {
			const span = li.createSpan({ cls: SIGNIFIER_CLASS, text: line.signifier.symbol || line.signifier.char });
			span.dataset.signifier = line.signifier.char;
			if (line.signifier.position !== 'right') {
				li.setAttribute(SIGNIFIER_ATTR, line.signifier.char);
				span.addClass(SIGNIFIER_HIDDEN_CLASS);
			} else {
				li.appendText(' ');
			}
		}
		// The text sits in a span so a struck-through parent does not strike its children.
		li.createSpan({ cls: 'oh-my-bullet-preview-text', text: line.text });
		if (line.children && line.children.length > 0) appendPreviewList(li, line.children);
	}
}

/**
 * The sample day, drawn with the user's bullets. A line whose bullet or signifier
 * the user has removed is left out; anything the user has added follows at the end.
 */
export function overviewLines(settings: OhMyBulletSettings): PreviewLine[] {
	const bullets = validBullets(settings);
	const signifiers = validSignifiers(settings);
	const usedBullets = new Set<string>();
	const usedSignifiers = new Set<string>();

	const resolve = (lines: SampleLine[]): PreviewLine[] =>
		lines.flatMap((line) => {
			const bullet = bullets.find((b) => b.char === line.char);
			const signifier = line.signifier ? signifiers.find((sig) => sig.char === line.signifier) : undefined;
			if (!bullet || (line.signifier && !signifier)) return [];
			usedBullets.add(bullet.char);
			if (signifier) usedSignifiers.add(signifier.char);
			return [{ bullet, signifier, text: line.text, children: line.children ? resolve(line.children) : undefined }];
		});

	const lines = resolve(SAMPLE_DAY);
	const task = bullets.find((b) => b.char === ' ') ?? bullets[0];
	for (const bullet of bullets) {
		if (!usedBullets.has(bullet.char)) lines.push({ bullet, text: capitalize(bullet.meaning || `[${bullet.char}]`) });
	}
	for (const signifier of signifiers) {
		if (task && !usedSignifiers.has(signifier.char)) {
			lines.push({ bullet: task, signifier, text: capitalize(signifier.meaning || signifier.char) });
		}
	}
	return lines;
}
