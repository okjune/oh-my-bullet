import { App, Modal, Setting } from 'obsidian';

/** Asks before throwing away the user's bullets and signifiers. */
export class ResetConfirmModal extends Modal {
	constructor(
		app: App,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle('Reset to defaults?');
		this.contentEl.createEl('p', {
			text: 'Every bullet and signifier goes back to how it was when the plugin was first installed. Your notes are not changed.',
		});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Reset')
					.setDestructive()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
