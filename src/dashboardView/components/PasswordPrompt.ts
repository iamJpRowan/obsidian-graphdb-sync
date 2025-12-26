import { Modal, Setting } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { CredentialService } from "../../services/CredentialService"

/**
 * Password prompt modal
 */
export class PasswordPrompt extends Modal {
	private plugin: GraphDBSyncPlugin
	private password: string | null = null
	private resolveCallback: ((password: string | null) => void) | null = null

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app)
		this.plugin = plugin
	}

	/**
	 * Shows the password prompt and returns the password
	 */
	static async prompt(plugin: GraphDBSyncPlugin): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new PasswordPrompt(plugin)
			modal.resolveCallback = resolve
			modal.open()
		})
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-password-prompt")

		// Title
		contentEl.createEl("h2", {
			text: "Enter Neo4j Password",
		})

		// Description
		contentEl.createEl("p", {
			text: "Password is stored in memory for this session only and will be cleared when Obsidian closes.",
			cls: "graphdb-password-prompt-desc",
		})

		// Password input
		let passwordValue = ""
		new Setting(contentEl)
			.setName("Password")
			.addText((text) => {
				text.inputEl.type = "password"
				text.setPlaceholder("Enter password")
				text.inputEl.focus()
				text.onChange((value) => {
					passwordValue = value || ""
				})
				// Handle Enter key
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && passwordValue) {
						this.submit(passwordValue)
					}
				})
			})

		// Buttons
		const buttonContainer = contentEl.createDiv("graphdb-password-prompt-buttons")
		
		const submitBtn = buttonContainer.createEl("button", {
			text: "Set Password",
			cls: "mod-cta",
		})
		submitBtn.addEventListener("click", () => {
			if (passwordValue) {
				this.submit(passwordValue)
			}
		})

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		})
		cancelBtn.addEventListener("click", () => {
			this.cancel()
		})
	}

	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
		
		// If not resolved yet, resolve with null (cancelled)
		if (this.resolveCallback) {
			this.resolveCallback(null)
			this.resolveCallback = null
		}
	}

	/**
	 * Submits the password
	 */
	private submit(password: string): void {
		CredentialService.setSessionPassword(password)
		this.password = password
		if (this.resolveCallback) {
			this.resolveCallback(password)
			this.resolveCallback = null
		}
		this.close()
	}

	/**
	 * Cancels the prompt
	 */
	private cancel(): void {
		if (this.resolveCallback) {
			this.resolveCallback(null)
			this.resolveCallback = null
		}
		this.close()
	}
}

