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

		// Sync settings
		containerEl.createEl("h2", { text: "Sync settings" })

		// Batch size setting
		const batchSizeSetting = new Setting(containerEl)
			.setName("Sync batch size")
			.setDesc("Number of files to process per batch. 'Auto' calculates based on vault size.")
			.addDropdown((dropdown) => {
				const currentValue = this.plugin.settings.syncBatchSize || DEFAULT_SETTINGS.syncBatchSize
				const mode = currentValue === "auto" ? "auto" : "manual"
				dropdown
					.addOption("auto", "Auto")
					.addOption("manual", "Manual")
					.setValue(mode)
					.onChange(async (value) => {
						if (value === "auto") {
							this.plugin.settings.syncBatchSize = "auto"
						} else {
							// Keep existing manual value or use default
							const existingValue = typeof this.plugin.settings.syncBatchSize === "number" 
								? this.plugin.settings.syncBatchSize 
								: 100
							this.plugin.settings.syncBatchSize = existingValue
						}
						await this.plugin.saveSettings()
						// Refresh the setting to show/hide number input
						this.display()
					})
			})

		// Add number input if manual mode is selected
		const currentValue = this.plugin.settings.syncBatchSize || DEFAULT_SETTINGS.syncBatchSize
		const isManual = currentValue !== "auto"
		
		if (isManual) {
			batchSizeSetting.addText((text) => {
				const manualValue = typeof currentValue === "number" ? currentValue : 100
				text.setPlaceholder("100")
				text.setValue(manualValue.toString())
				text.inputEl.type = "number"
				text.inputEl.min = "1"
				text.inputEl.max = "10000"
				text.onChange(async (value: string) => {
					const numValue = parseInt(value, 10)
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.syncBatchSize = numValue
						await this.plugin.saveSettings()
					}
				})
			})
		}
	}
}


