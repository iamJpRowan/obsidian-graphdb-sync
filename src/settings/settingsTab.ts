import { Notice, PluginSettingTab, Setting } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { CredentialService } from "../services/CredentialService"
import { Neo4jService } from "../services/Neo4jService"
import { DEFAULT_SETTINGS } from "../types"

/**
 * Settings tab for configuring Neo4j connection
 */
export class SettingsTab extends PluginSettingTab {
	plugin: GraphDBSyncPlugin
	private passwordInput: HTMLInputElement | null = null
	private connectionStatusDescEl: HTMLElement | null = null
	private testButton: HTMLButtonElement | null = null

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		// Neo4j URI setting
		new Setting(containerEl)
			.setName("Neo4j URI")
			.setDesc("Connection URI (e.g., neo4j://localhost:7687)")
			.addText((text) =>
				text
					.setPlaceholder("neo4j://localhost:7687")
					.setValue(
						this.plugin.settings.neo4jUri ||
							DEFAULT_SETTINGS.neo4jUri
					)
					.onChange(async (value) => {
						this.plugin.settings.neo4jUri = value
						await this.plugin.saveSettings()
						this.resetConnectionStatus()
						this.updateConnectionStatus()
					})
			)

		// Username setting
		new Setting(containerEl)
			.setName("Username")
			.setDesc("Neo4j username")
			.addText((text) =>
				text
					.setPlaceholder("neo4j")
					.setValue(
						this.plugin.settings.neo4jUsername ||
							DEFAULT_SETTINGS.neo4jUsername
					)
					.onChange(async (value) => {
						this.plugin.settings.neo4jUsername = value
						await this.plugin.saveSettings()
						this.resetConnectionStatus()
						this.updateConnectionStatus()
					})
			)

		// Password field with input and buttons
		const hasSessionPassword = CredentialService.hasPassword()

		const passwordSetting = new Setting(containerEl)
			.setName("Password")
			.setDesc(
				hasSessionPassword
					? "Password is set for this session (will be reset when Obsidian closes)"
					: "Enter password to store in session (will be reset when Obsidian closes)"
			)

		// Show input and set button if no session password is set
		if (!hasSessionPassword) {
			// Password input
			let passwordValue: string = ""
			passwordSetting.addText((text) => {
				this.passwordInput = text.inputEl
				text.inputEl.type = "password"
				text.setPlaceholder("Enter password")
				text.setValue("")
				text.onChange((value) => {
					passwordValue = value || ""
				})
			})

			// Set password button
			passwordSetting.addButton((button) => {
				button.setButtonText("Set password")
				button.onClick(async () => {
					if (passwordValue) {
						CredentialService.setSessionPassword(passwordValue)
						passwordValue = ""
						if (this.passwordInput) {
							this.passwordInput.value = ""
						}
						new Notice("Password set for this session")
						this.updateConnectionStatus()
						this.display() // Refresh to show clear button only
					}
				})
			})
		}

		// Clear password button (only show if session password is set)
		if (hasSessionPassword) {
			passwordSetting.addButton((button) => {
				button.setButtonText("Clear")
				button.onClick(async () => {
					CredentialService.clearSessionPassword()
					new Notice("Session password cleared")
					this.resetConnectionStatus()
					this.updateConnectionStatus()
					this.display() // Refresh to show input and set button
				})
			})
		}

		// Connection status field
		const connectionStatusSetting = new Setting(containerEl)
			.setName("Connection status")
		this.connectionStatusDescEl = connectionStatusSetting.descEl

		// Test button
		connectionStatusSetting.addButton((button) => {
			this.testButton = button.buttonEl
			button.setButtonText("Test")
			button.onClick(async () => {
				await this.testConnection()
			})
		})

		// Initialize connection status
		this.updateConnectionStatus()
	}

	private updateConnectionStatus(): void {
		if (!this.connectionStatusDescEl) {
			return
		}

		const hasPassword = CredentialService.hasPassword()
		const hasUri =
			this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const hasUsername =
			this.plugin.settings.neo4jUsername ||
			DEFAULT_SETTINGS.neo4jUsername

		// Update test button state
		if (this.testButton) {
			this.testButton.disabled = !hasPassword || !hasUri || !hasUsername
		}

		// Update status description if not already set by test result
		if (!this.connectionStatusDescEl.hasClass("graphdb-test-testing")) {
			if (!hasPassword) {
				this.updateStatusDisplay(
					"default",
					"Password required (enter password above)"
				)
			} else if (!hasUri || !hasUsername) {
				this.updateStatusDisplay("default", "URI and username required")
			} else {
				this.updateStatusDisplay(
					"default",
					"Ready to test connection"
				)
			}
		}
	}

	private resetConnectionStatus(): void {
		if (!this.connectionStatusDescEl) {
			return
		}

		// Clear status classes
		this.connectionStatusDescEl.removeClass("graphdb-test-success")
		this.connectionStatusDescEl.removeClass("graphdb-test-error")
		this.connectionStatusDescEl.removeClass("graphdb-test-testing")
	}

	private updateStatusDisplay(
		type: "default" | "testing" | "success" | "error",
		message: string
	): void {
		if (!this.connectionStatusDescEl) {
			return
		}

		// Clear existing classes
		this.resetConnectionStatus()

		// Set icon and message based on type
		let icon = ""
		if (type === "success") {
			icon = "✓ "
			this.connectionStatusDescEl.addClass("graphdb-test-success")
		} else if (type === "error") {
			icon = "✗ "
			this.connectionStatusDescEl.addClass("graphdb-test-error")
		} else if (type === "testing") {
			icon = "⟳ "
			this.connectionStatusDescEl.addClass("graphdb-test-testing")
		}

		this.connectionStatusDescEl.setText(icon + message)
	}

	private async testConnection(): Promise<void> {
		if (!this.connectionStatusDescEl) {
			return
		}

		// Show testing state
		this.updateStatusDisplay("testing", "Testing connection...")

		// Get URI and username, using defaults if not set
		const uri =
			this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username =
			this.plugin.settings.neo4jUsername ||
			DEFAULT_SETTINGS.neo4jUsername

		// Get password - should be available if button is enabled
		const password = CredentialService.getPassword()
		if (!password) {
			this.updateStatusDisplay(
				"error",
				"Password required (enter password above)"
			)
			return
		}

		// Test connection
		try {
			await Neo4jService.testConnection(uri, {
				username: username,
				password: password,
			})
			this.updateStatusDisplay("success", "Connection successful!")
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			this.updateStatusDisplay("error", `Connection failed: ${errorMessage}`)
		}
	}

}
