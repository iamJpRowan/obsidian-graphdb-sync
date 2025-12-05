import { Notice, PluginSettingTab, Setting } from "obsidian"
import type GraphDBSyncPlugin from "./main"
import { CredentialService } from "./services/CredentialService"
import { StateService, type PluginState } from "./services/StateService"
import { DEFAULT_SETTINGS } from "./types"

/**
 * Settings tab for configuring Neo4j connection
 */
export class SettingsTab extends PluginSettingTab {
	plugin: GraphDBSyncPlugin
	private passwordInput: HTMLInputElement | null = null
	private connectionStatusDescEl: HTMLElement | null = null
	private unsubscribeState: (() => void) | null = null

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		// Unsubscribe from previous state changes
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}

		// Subscribe to connection state changes
		this.unsubscribeState = StateService.subscribe("connection", (state: PluginState) => {
			this.updateConnectionStatusDisplay(state.connection)
		})

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
						// Auto-test connection on change (state changes will trigger UI updates)
						await StateService.testConnection(this.plugin.settings)
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
						// Auto-test connection on change (state changes will trigger UI updates)
						await StateService.testConnection(this.plugin.settings)
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
						// Auto-test connection immediately after setting password (bypass debounce)
						await StateService.testConnection(
							this.plugin.settings,
							500,
							true
						)
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
					// Auto-test connection after clearing password (will show error, state changes will trigger UI updates)
					await StateService.testConnection(this.plugin.settings)
					this.display() // Refresh to show input and set button
				})
			})
		}

		// Connection status field
		const connectionStatusSetting = new Setting(containerEl)
			.setName("Connection status")
		this.connectionStatusDescEl = connectionStatusSetting.descEl

		// Initialize connection status from current state
		const currentState = StateService.getState()
		this.updateConnectionStatusDisplay(currentState.connection)

		// Auto-test connection on initial display
		StateService.testConnection(this.plugin.settings)
	}

	onClose(): void {
		// Unsubscribe from state changes when settings tab closes
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}
	}

	/**
	 * Updates the connection status display based on connection state
	 */
	private updateConnectionStatusDisplay(
		connectionState: { status: string; error?: string }
	): void {
		if (!this.connectionStatusDescEl) {
			return
		}

		// Clear existing classes
		this.connectionStatusDescEl.removeClass("graphdb-test-success")
		this.connectionStatusDescEl.removeClass("graphdb-test-error")
		this.connectionStatusDescEl.removeClass("graphdb-test-testing")

		// Set icon and message based on status
		let icon = ""
		let message = ""

		if (connectionState.status === "testing") {
			icon = "⟳ "
			message = "Testing connection..."
			this.connectionStatusDescEl.addClass("graphdb-test-testing")
		} else if (connectionState.status === "connected") {
			icon = "✓ "
			message = "Connection successful"
			this.connectionStatusDescEl.addClass("graphdb-test-success")
		} else if (connectionState.status === "error") {
			icon = "✗ "
			message = connectionState.error || "Connection failed"
			this.connectionStatusDescEl.addClass("graphdb-test-error")
		} else {
			// unknown status
			message = "Connection status unknown"
		}

		this.connectionStatusDescEl.setText(icon + message)
	}

}
