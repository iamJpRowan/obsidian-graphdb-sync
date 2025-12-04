import { Plugin } from "obsidian"
import { SettingsTab } from "./settings/settingsTab"
import { CredentialService } from "./services/CredentialService"
import { DEFAULT_SETTINGS, type PluginSettings } from "./types"

export default class GraphDBSyncPlugin extends Plugin {
	settings: PluginSettings

	async onload() {
		await this.loadSettings()

		// Register settings tab
		this.addSettingTab(new SettingsTab(this))
	}

	onunload() {
		// Clear session password from memory on plugin unload
		CredentialService.clearSessionPassword()
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}
