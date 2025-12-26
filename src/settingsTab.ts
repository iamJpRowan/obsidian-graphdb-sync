import { PluginSettingTab, Setting } from "obsidian"
import type GraphDBSyncPlugin from "./main"
import { SettingsService } from "./services/SettingsService"
import { DEFAULT_SETTINGS } from "./types"

/**
 * Settings tab for GraphDB Sync plugin
 */
export class SettingsTab extends PluginSettingTab {
	plugin: GraphDBSyncPlugin

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		// Connection settings
		new Setting(containerEl)
			.setName("Neo4j URI")
			.setDesc("Connection URI (e.g., neo4j://localhost:7687)")
			.addText((text) => {
				text.setPlaceholder("neo4j://localhost:7687")
				text.setValue(
					this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
				)
				text.onChange(async (value) => {
					await SettingsService.updateConnectionSettings(
						this.plugin,
						value,
						this.plugin.settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
					)
				})
			})

		new Setting(containerEl)
			.setName("Username")
			.setDesc("Neo4j username")
			.addText((text) => {
				text.setPlaceholder("neo4j")
				text.setValue(
					this.plugin.settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
				)
				text.onChange(async (value) => {
					await SettingsService.updateConnectionSettings(
						this.plugin,
						this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri,
						value
					)
				})
			})

		containerEl.createEl("p", {
			text: "Password is prompted when starting a migration and stored in memory for the session only.",
			cls: "setting-item-description",
		})
	}
}

