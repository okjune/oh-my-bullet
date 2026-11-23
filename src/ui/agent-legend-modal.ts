import { Modal, Setting } from 'obsidian';
import type OhMyBulletPlugin from '../main';

/** Asked once, on first run: writing into the vault is the user's call. */
export function askAboutAgentLegend(plugin: OhMyBulletPlugin) {
	const answer = async (mode: 'on' | 'off') => {
		plugin.settings.agentLegend = mode;
		await plugin.saveSettings();
	};
	const modal = new Modal(plugin.app);
	modal.setTitle('Explain your bullets to AI agents?');
	modal.contentEl.createEl('p', {
		text: 'AI agents read the raw text of your notes, so they cannot see what a bullet such as "- [>]" means. Oh My Bullet can keep a short legend in AGENTS.md (and CLAUDE.md, if you have one) at the top of this vault. You can change this later in the settings.',
	});
	new Setting(modal.contentEl)
		.addButton((button) =>
			button.setButtonText('Not now').onClick(() => {
				modal.close();
				void answer('off');
			}),
		)
		.addButton((button) =>
			button
				.setButtonText('Add the legend')
				.setCta()
				.onClick(() => {
					modal.close();
					void answer('on');
				}),
		);
	modal.open();
}
