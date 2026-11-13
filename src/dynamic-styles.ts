import { SIGNIFIER_ATTR, SIGNIFIER_CLASS } from './signifiers';
import {
	COLORS,
	OhMyBulletSettings,
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
	// One stroke of the cross: started, not finished.
	'/': svg(`<path d='M17.5 6.5l-11 11'/>`),
	'>': svg(`<path d='M9 6l6 6-6 6'/>`),
	'<': svg(`<path d='M15 6l-6 6 6 6'/>`),
	'–': svg(`<path d='M6 12h12'/>`),
	'-': svg(`<path d='M6 12h12'/>`),
	'○': svg(`<circle cx='12' cy='12' r='8.5' stroke-width='2'/>`),
	'●': svg(`<circle cx='12' cy='12' r='9.5' fill='black' stroke='none'/>`),
};

/**
 * Signifier symbols drawn as shapes, for the same reason as the bullets: the heavy
 * asterisk is bold on a Mac and a thin little star on an iPhone.
 */
const SIGNIFIER_ICONS: Record<string, string> = {
	'✱': svg(`<path d='M12 4.5v15M5.5 8.25l13 7.5M5.5 15.75l13-7.5'/>`),
};

const CHECKBOX = 'input.task-list-item-checkbox';
/** Appended to a selector to raise its specificity without changing what it matches. */
const STRONG = '.task-list-item-checkbox.task-list-item-checkbox';

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
export function buildDynamicCss(settings: OhMyBulletSettings): string {
	const rules: string[] = [];

	// Obsidian strikes through and fades every checked task. Turn that off;
	// each bullet decides how its own line looks.
	rules.push('body { --checklist-done-decoration: none; --checklist-done-color: var(--text-normal); }');

	const bullets = validBullets(settings);
	const all = bullets.flatMap((b) => checkboxSelectors(b.char));
	if (all.length > 0) {
		// Hide the box but keep it as the click target, then draw the symbol on top.
		// Themes paint their own icons for characters such as `>` and `/`, on the box
		// itself or on its pseudo-elements, with selectors that outrank anything written
		// here. So these rules are !important: a bullet must look the same in every theme.
		rules.push(
			`${all.join(', ')} { --checkbox-color: transparent; --checkbox-color-hover: transparent; --checkbox-border-color: transparent; --checkbox-border-color-hover: transparent; background: transparent none !important; -webkit-mask: none !important; mask: none !important; border-color: transparent !important; box-shadow: none !important; transform: none !important; rotate: none !important; filter: none !important; }`,
		);
		rules.push(`${all.map((s) => s + '::before').join(', ')} { content: none !important; }`);
		rules.push(
			`${all.map((s) => s + '::after').join(', ')} { content: "" !important; position: absolute !important; inset: -1px !important; width: auto !important; height: auto !important; margin: 0 !important; display: block !important; opacity: 1 !important; transform: none !important; border: none !important; box-shadow: none !important; -webkit-mask-image: none; mask-image: none; background-color: transparent; }`,
		);
	}

	for (const bullet of bullets) {
		const selectors = checkboxSelectors(bullet.char);
		const after = selectors.map((sel) => sel + '::after').join(', ');
		const color = colorOf(bullet.color);
		const icon = ICONS[bullet.symbol];
		if (icon) {
			rules.push(
				`${after} { background: ${color} none !important; -webkit-mask: ${icon} center / 100% no-repeat !important; mask: ${icon} center / 100% no-repeat !important; }`,
			);
		} else {
			rules.push(
				`${after} { content: ${cssString(bullet.symbol)} !important; display: flex !important; align-items: center; justify-content: center; background: none !important; -webkit-mask: none !important; mask: none !important; color: ${color} !important; font-family: var(--font-interface); font-size: var(--checkbox-size); font-weight: 700; line-height: 1; }`,
			);
		}
		// The text of the line: always stated, never left to the theme. Some themes fade or
		// strike every checked line with selectors that ignore Obsidian's variables.
		const colored = bullet.textColor && bullet.textColor !== DEFAULT_TEXT_COLOR;
		const textColor = colored ? colorOf(bullet.textColor) : 'var(--text-normal)';
		const lines = [bullet.strike ? 'line-through' : '', bullet.underline ? 'underline' : ''].filter(Boolean);
		const decoration = lines.length > 0 ? lines.join(' ') : 'none';
		const text = [
			`color: ${textColor} !important;`,
			`text-decoration: ${decoration} !important;`,
			// Obsidian styles checked lines through these two variables.
			`--checklist-done-color: ${textColor};`,
			`--checklist-done-decoration: ${decoration};`,
		];
		if (bullet.bold) text.push('font-weight: var(--bold-weight, 700) !important;');
		if (bullet.italic) text.push('font-style: italic !important;');
		// Reading view marks the open task with an empty data-task.
		const value = cssString(bullet.char);
		const reading =
			bullet.char === ' '
				? 'li.task-list-item[data-task=""], li.task-list-item[data-task=" "]'
				: `li.task-list-item[data-task=${value}]`;
		rules.push(`.HyperMD-task-line[data-task=${value}], ${reading} { ${text.join(' ')} }`);
	}

	for (const signifier of validSignifiers(settings)) {
		const value = cssString(signifier.char);
		const color = colorOf(signifier.color);
		const icon = SIGNIFIER_ICONS[signifier.symbol];
		if (icon) {
			// The symbol stays in the text for copying and screen readers; the shape is painted over it.
			rules.push(
				`.${SIGNIFIER_CLASS}[data-signifier=${value}] { height: 1em; overflow: hidden; vertical-align: -0.14em; color: transparent; background-color: ${color}; -webkit-mask: ${icon} center / 1em 1em no-repeat; mask: ${icon} center / 1em 1em no-repeat; }`,
			);
		} else {
			rules.push(`.${SIGNIFIER_CLASS}[data-signifier=${value}] { color: ${color}; }`);
		}

		const position = signifier.position ?? 'right';
		if (position === 'right') continue;
		// Left and center are drawn from the checkbox, so they can sit outside the text flow.
		const before = [
			// The class is doubled so these outrank the reset above, which is !important too.
			`.HyperMD-task-line[${SIGNIFIER_ATTR}=${value}] ${CHECKBOX}${STRONG}::before`,
			`li[${SIGNIFIER_ATTR}=${value}] > ${CHECKBOX}${STRONG}::before`,
			`li[${SIGNIFIER_ATTR}=${value}] > p > ${CHECKBOX}${STRONG}::before`,
		].join(', ');
		const place =
			position === 'left'
				? 'right: 100%; margin-right: 0.3em; top: 50%; transform: translateY(-50%);'
				: 'left: 50%; top: 50%; transform: translate(-50%, -50%);';
		const drawn = icon
			? `content: "" !important; width: var(--checkbox-size); height: var(--checkbox-size); background-color: ${color}; -webkit-mask: ${icon} center / 100% no-repeat; mask: ${icon} center / 100% no-repeat;`
			: `content: ${cssString(signifier.symbol)} !important; display: flex; align-items: center; justify-content: center; height: var(--checkbox-size); color: ${color}; font-family: var(--font-interface); font-size: var(--checkbox-size); font-weight: 800; line-height: 1; white-space: nowrap;`;
		rules.push(`${before} { position: absolute; ${place} z-index: 1; pointer-events: none; ${drawn} }`);
	}

	return rules.join('\n');
}
