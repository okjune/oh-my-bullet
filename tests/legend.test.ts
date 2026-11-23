import type { App } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { buildAgentLegend, buildNoteLegend, syncAgentLegend, withLegend, withoutLegend } from '../src/legend';
import { AgentLegendMode, DEFAULT_SETTINGS, OhMyBulletSettings } from '../src/settings/defaults';
import { TFile } from './obsidian-stub';

const settings = (agentLegend: AgentLegendMode = 'on'): OhMyBulletSettings => ({
	...structuredClone(DEFAULT_SETTINGS),
	agentLegend,
});
const legend = buildAgentLegend(settings());

describe('buildAgentLegend', () => {
	it('is wrapped in markers and lists every bullet and signifier', () => {
		expect(legend.startsWith('<!-- oh-my-bullet:start -->')).toBe(true);
		expect(legend.endsWith('<!-- oh-my-bullet:end -->')).toBe(true);
		expect(legend).toContain('- `- [>]` task migrated to a later note');
		expect(legend).toContain('- `*` priority');
	});
});

describe('withLegend', () => {
	it('adds the legend to an empty file', () => {
		expect(withLegend('', legend)).toBe(legend + '\n');
	});

	it('adds the legend after what the file already says', () => {
		expect(withLegend('# Vault notes\n', legend)).toBe('# Vault notes\n\n' + legend + '\n');
	});

	it('replaces an earlier legend in place', () => {
		const older = buildAgentLegend({ ...settings(), signifiers: [] });
		const text = 'Before\n\n' + older + '\n\nAfter\n';
		expect(withLegend(text, legend)).toBe('Before\n\n' + legend + '\n\nAfter\n');
	});
});

describe('withoutLegend', () => {
	it('takes the legend out and keeps the text around it', () => {
		expect(withoutLegend('Before\n\n' + legend + '\n\nAfter\n')).toBe('Before\n\nAfter\n');
		expect(withoutLegend('Before\n\n' + legend + '\n')).toBe('Before\n');
	});

	it('leaves nothing of a file that held only the legend', () => {
		expect(withoutLegend(legend + '\n')).toBe('');
	});

	it('leaves a file without a legend unchanged', () => {
		expect(withoutLegend('# Mine\n')).toBe('# Mine\n');
		expect(withoutLegend('')).toBe('');
	});
});

/** A vault with the given files at its top, recording what the plugin does to them. */
function fakeApp(files: Record<string, string>) {
	const trashed: string[] = [];
	const created: string[] = [];
	const tfiles = new Map<string, TFile>();
	for (const path of Object.keys(files)) {
		const file = new TFile();
		file.path = path;
		tfiles.set(path, file);
	}
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => tfiles.get(path) ?? null,
			read: (file: TFile) => Promise.resolve(files[file.path] ?? ''),
			process: (file: TFile, change: (text: string) => string) => {
				files[file.path] = change(files[file.path] ?? '');
				return Promise.resolve(files[file.path]);
			},
			create: (path: string, text: string) => {
				files[path] = text;
				created.push(path);
				return Promise.resolve();
			},
		},
		fileManager: {
			trashFile: (file: TFile) => {
				trashed.push(file.path);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	return { app, files, trashed, created };
}

describe('syncAgentLegend', () => {
	it('creates AGENTS.md when the vault has no agent file', async () => {
		const vault = fakeApp({});
		await syncAgentLegend(vault.app, settings('on'));
		expect(vault.created).toEqual(['AGENTS.md']);
		expect(vault.files['AGENTS.md']).toBe(legend + '\n');
	});

	it('updates every agent file there is', async () => {
		const vault = fakeApp({ 'AGENTS.md': '# Agents\n', 'CLAUDE.md': '# Claude\n' });
		await syncAgentLegend(vault.app, settings('on'));
		expect(vault.created).toEqual([]);
		expect(vault.files['AGENTS.md']).toBe('# Agents\n\n' + legend + '\n');
		expect(vault.files['CLAUDE.md']).toBe('# Claude\n\n' + legend + '\n');
	});

	it('when turned off, trashes a file that held only the legend', async () => {
		const vault = fakeApp({ 'AGENTS.md': legend + '\n', 'CLAUDE.md': '# Claude\n\n' + legend + '\n' });
		await syncAgentLegend(vault.app, settings('off'));
		expect(vault.trashed).toEqual(['AGENTS.md']);
		expect(vault.files['CLAUDE.md']).toBe('# Claude\n');
	});

	it('when turned off, leaves an empty file the user made alone', async () => {
		const vault = fakeApp({ 'CLAUDE.md': '', 'AGENTS.md': '\n' });
		await syncAgentLegend(vault.app, settings('off'));
		expect(vault.trashed).toEqual([]);
		expect(vault.files).toEqual({ 'CLAUDE.md': '', 'AGENTS.md': '\n' });
	});
});

describe('buildNoteLegend', () => {
	it('lists only the bullets and signifiers the note uses', () => {
		const note = ['- [ ] Plain task', '- [x] Done', '- [>] Renew passport', '- [ ] * Write the summary'].join('\n');
		expect(buildNoteLegend(note, settings())).toBe(
			'[>] task migrated to a later note; * after the checkbox: priority',
		);
	});

	it('skips tasks inside code blocks', () => {
		const note = ['```md', '- [<] Inside code', '```', '- [o] Team dinner'].join('\n');
		expect(buildNoteLegend(note, settings())).toBe('[o] event');
	});

	it('is empty for a note with no special bullets', () => {
		expect(buildNoteLegend('- [ ] Plain task\n- [x] Done', settings())).toBe('');
	});
});
