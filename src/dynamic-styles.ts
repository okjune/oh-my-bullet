import { SIGNIFIER_ATTR, SIGNIFIER_CLASS } from './signifiers';
import {
	COLORS,
	CustomBulletsSettings,
	DEFAULT_TEXT_COLOR,
	validBullets,
	validSignifiers,
} from './settings';

function cssString(value: string): string {
	return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function colorOf(key: string): string {
	return (COLORS[key] ?? COLORS.text)?.css ?? 'var(--text-normal)';
}

function svg(body: string): string {
	const source = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(source)}")`;
}

/**
 * Common symbols are drawn as shapes, because the same glyph sits at a different
 * height and size in every font. Any other symbol falls back to text.
 */
const ICONS: Record<string, string> = {
	'•': svg(`<circle cx='12' cy='12' r='3.6' fill='black' stroke='none'/>`),
	'×': svg(`<path d='M6.5 6.5l11 11M17.5 6.5l-11 11'/>`),
	'x': svg(`<path d='M6.5 6.5l11 11M17.5 6.5l-11 11'/>`),
	'>': svg(`<path d='M9 6l6 6-6 6'/>`),
	'<': svg(`<path d='M15 6l-6 6 6 6'/>`),
	'–': svg(`<path d='M6 12h12'/>`),
	'-': svg(`<path d='M6 12h12'/>`),
	'○': svg(`<circle cx='12' cy='12' r='8.5' stroke-width='2'/>`),
	'●': svg(`<circle cx='12' cy='12' r='9.5' fill='black' stroke='none'/>`),
};

const CHECKBOX = 'input.task-list-item-checkbox';

/** Selectors for the checkbox of one bullet, in Live Preview and in reading view. */
function checkboxSelectors(char: string): string[] {
	// The open task has no reliable data-task value in reading view; "not checked" covers both views.
	if (char === ' ') return [`${CHECKBOX}:not(:checked)`];
	const value = cssString(char);
	return [
		`${CHECKBOX}[data-task=${value}]`,
		`li[data-task=${value}] > ${CHECKBOX}`,
		`li[data-task=${value}] > p > ${CHECKBOX}`,
	];
}

/** The rules that depend on the user's settings. Everything else lives in styles.css. */
export function buildDynamicCss(settings: CustomBulletsSettings): string {
	const rules: string[] = [];

	// Obsidian strikes through and fades every checked task. Turn that off;
	// each bullet decides how its own line looks.
	rules.push('body { --checklist-done-decoration: none; --checklist-done-color: var(--text-normal); }');

	const bullets = validBullets(settings);
	const all = bullets.flatMap((b) => checkboxSelectors(b.char));
	if (all.length > 0) {
		// Hide the box but keep it as the click target, then draw the symbol on top.
		rules.push(
			`${all.join(', ')} { --checkbox-color: transparent; --checkbox-color-hover: transparent; --checkbox-border-color: transparent; --checkbox-border-color-hover: transparent; }`,
		);
		rules.push(
			`${all.map((s) => s + '::after').join(', ')} { content: ""; position: absolute; inset: -1px; width: auto; height: auto; display: block; -webkit-mask-image: none; mask-image: none; background-color: transparent; }`,
		);
	}

	for (const bullet of bullets) {
		const selectors = checkboxSelectors(bullet.char);
		const after = selectors.map((sel) => sel + '::after').join(', ');
		const color = colorOf(bullet.color);
		const icon = ICONS[bullet.symbol];
		if (icon) {
			rules.push(
				`${after} { background-color: ${color}; -webkit-mask: ${icon} center / 100% no-repeat; mask: ${icon} center / 100% no-repeat; }`,
			);
		} else {
			rules.push(
				`${after} { content: ${cssString(bullet.symbol)}; display: flex; align-items: center; justify-content: center; color: ${color}; font-family: var(--font-interface); font-size: var(--checkbox-size); font-weight: 700; line-height: 1; }`,
			);
		}
		const text: string[] = [];
		if (bullet.textColor && bullet.textColor !== DEFAULT_TEXT_COLOR) text.push(`color: ${colorOf(bullet.textColor)};`);
		const lines = [bullet.strike ? 'line-through' : '', bullet.underline ? 'underline' : ''].filter(Boolean);
		if (lines.length > 0) text.push(`text-decoration: ${lines.join(' ')};`);
		if (bullet.bold) text.push('font-weight: var(--bold-weight, 700);');
		if (bullet.italic) text.push('font-style: italic;');
		// Obsidian styles checked lines through these two variables with selectors that
		// outrank ours, so set them on the line as well as the properties themselves.
		if (lines.length > 0) text.push(`--checklist-done-decoration: ${lines.join(' ')};`);
		if (bullet.textColor && bullet.textColor !== DEFAULT_TEXT_COLOR) {
			text.push(`--checklist-done-color: ${colorOf(bullet.textColor)};`);
		}
		if (text.length > 0) {
			// Reading view marks the open task with an empty data-task.
			const value = cssString(bullet.char);
			const reading = bullet.char === ' ' ? 'li.task-list-item[data-task=""], li.task-list-item[data-task=" "]' : `li.task-list-item[data-task=${value}]`;
			rules.push(`.HyperMD-task-line[data-task=${value}], ${reading} { ${text.join(' ')} }`);
		}
	}

	for (const signifier of validSignifiers(settings)) {
		const value = cssString(signifier.char);
		const color = colorOf(signifier.color);
		rules.push(`.${SIGNIFIER_CLASS}[data-signifier=${value}] { color: ${color}; }`);

		const position = signifier.position ?? 'right';
		if (position === 'right') continue;
		// Left and center are drawn from the checkbox, so they can sit outside the text flow.
		const before = [
			`.HyperMD-task-line[${SIGNIFIER_ATTR}=${value}] ${CHECKBOX}::before`,
			`li[${SIGNIFIER_ATTR}=${value}] > ${CHECKBOX}::before`,
			`li[${SIGNIFIER_ATTR}=${value}] > p > ${CHECKBOX}::before`,
		].join(', ');
		const place =
			position === 'left'
				? 'right: 100%; margin-right: 0.3em; top: 50%; transform: translateY(-50%);'
				: 'left: 50%; top: 50%; transform: translate(-50%, -50%);';
		rules.push(
			`${before} { content: ${cssString(signifier.symbol)}; position: absolute; ${place} z-index: 1; display: flex; align-items: center; justify-content: center; height: var(--checkbox-size); color: ${color}; font-family: var(--font-interface); font-size: var(--checkbox-size); font-weight: 800; line-height: 1; white-space: nowrap; pointer-events: none; }`,
		);
	}

	return rules.join('\n');
}
