import { App, TFile, normalizePath } from 'obsidian';
import { OhMyBulletSettings, validBullets, validSignifiers } from './settings';

const START = '<!-- oh-my-bullet:start -->';
const END = '<!-- oh-my-bullet:end -->';
/** Agent instruction files at the top of the vault. The first one is created when none exists. */
const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md'];
export const NOTE_LEGEND_PROPERTY = 'bullet-legend';

function shown(char: string): string {
	return char === ' ' ? ' ' : char;
}

/** The legend as a Markdown section, wrapped in markers so it can be found again. */
export function buildAgentLegend(settings: OhMyBulletSettings): string {
	const bullets = validBullets(settings).filter((b) => b.meaning);
	const signifiers = validSignifiers(settings).filter((s) => s.meaning);
	const lines = [
		START,
		'## Task notation',
		'',
		'Tasks in this vault use the Oh My Bullet plugin. The character inside the brackets of a task is its bullet.',
		'',
		...bullets.map((b) => `- \`- [${shown(b.char)}]\` ${b.meaning}`),
	];
	if (signifiers.length > 0) {
		const example = signifiers[0]?.char ?? '*';
		lines.push(
			'',
			`A signifier is one character typed right after the checkbox, as in \`- [ ] ${example} text\`. It adds meaning to the bullet and can be combined with any of them. It is not a nested list item.`,
			'',
			...signifiers.map((s) => `- \`${s.char}\` ${s.meaning}`),
		);
	}
	lines.push('', 'Use the same notation when you add or change tasks.', END);
	return lines.join('\n');
}

/** Whether the text holds a complete legend section, start and end markers in order. */
function hasLegend(text: string): boolean {
	const start = text.indexOf(START);
	const end = text.indexOf(END);
	return start !== -1 && end !== -1 && end > start;
}

function withoutLegend(text: string): string {
	if (!hasLegend(text)) return text;
	const start = text.indexOf(START);
	const end = text.indexOf(END);
	const before = text.slice(0, start).replace(/\n+$/, '');
	const after = text.slice(end + END.length).replace(/^\n+/, '');
	if (!before) return after;
	if (!after) return before + '\n';
	return before + '\n\n' + after;
}

function withLegend(text: string, legend: string): string {
	const start = text.indexOf(START);
	const end = text.indexOf(END);
	if (start !== -1 && end !== -1 && end > start) {
		return text.slice(0, start) + legend + text.slice(end + END.length);
	}
	const rest = text.replace(/\n+$/, '');
	return (rest ? rest + '\n\n' : '') + legend + '\n';
}

/** Write, update or remove the legend in the vault's agent instruction files. */
export async function syncAgentLegend(app: App, settings: OhMyBulletSettings) {
	const existing = AGENT_FILES.map((name) => app.vault.getAbstractFileByPath(normalizePath(name))).filter(
		(file): file is TFile => file instanceof TFile,
	);

	if (settings.agentLegend !== 'on') {
		for (const file of existing) {
			// Only a file that holds the legend is ours to touch. One without it, even an
			// empty one, belongs to the user and is left exactly as it is.
			if (!hasLegend(await app.vault.read(file))) continue;
			const rest = await app.vault.process(file, (text) => withoutLegend(text));
			// A file that held nothing but the legend was created by this plugin; do not leave it empty.
			if (rest.trim() === '') await app.fileManager.trashFile(file);
		}
		return;
	}

	const legend = buildAgentLegend(settings);
	if (existing.length === 0) {
		await app.vault.create(normalizePath(AGENT_FILES[0] ?? 'AGENTS.md'), legend + '\n');
		return;
	}
	for (const file of existing) {
		await app.vault.process(file, (text) => withLegend(text, legend));
	}
}

/** The legend for one note: only the markers that note actually uses, plain task and done aside. */
export function buildNoteLegend(text: string, settings: OhMyBulletSettings): string {
	const bullets = validBullets(settings).filter((b) => b.meaning && b.char !== ' ' && b.char !== 'x');
	const signifiers = validSignifiers(settings).filter((s) => s.meaning);
	const usedBullets = new Set<string>();
	const usedSignifiers = new Set<string>();
	const task = /^\s*(?:[-*+]|\d+[.)])\s\[(.)\](?:\s(\S)(?=\s))?/;
	let inCode = false;
	for (const line of text.split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) {
			inCode = !inCode;
			continue;
		}
		if (inCode) continue;
		const match = task.exec(line);
		if (!match) continue;
		if (match[1]) usedBullets.add(match[1]);
		if (match[2]) usedSignifiers.add(match[2]);
	}
	const parts = [
		...bullets.filter((b) => usedBullets.has(b.char)).map((b) => `[${b.char}] ${b.meaning}`),
		...signifiers.filter((s) => usedSignifiers.has(s.char)).map((s) => `${s.char} after the checkbox: ${s.meaning}`),
	];
	return parts.join('; ');
}

/** Set, update or remove the legend property of one note. Does nothing when it is already right. */
export async function syncNoteLegend(app: App, file: TFile, settings: OhMyBulletSettings) {
	if (file.extension !== 'md') return;
	// The file may have been deleted or renamed since the user left it.
	if (app.vault.getAbstractFileByPath(file.path) !== file) return;
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const current = typeof frontmatter?.[NOTE_LEGEND_PROPERTY] === 'string' ? frontmatter[NOTE_LEGEND_PROPERTY] : '';
	// With the option off there is only ever something to remove.
	if (!settings.noteLegend && !current) return;
	const wanted = settings.noteLegend ? buildNoteLegend(await app.vault.cachedRead(file), settings) : '';
	if (wanted === current) return;
	await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
		if (wanted) fm[NOTE_LEGEND_PROPERTY] = wanted;
		else delete fm[NOTE_LEGEND_PROPERTY];
	});
}
