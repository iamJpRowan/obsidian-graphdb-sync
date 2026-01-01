import { Setting } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { SettingsService } from "../../services/SettingsService"
import { DEFAULT_SETTINGS } from "../../types"

/**
 * Reusable settings content component
 * Can be used in both the Obsidian settings tab and the dashboard
 */
export class SettingsTabContent {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private onSettingsChange?: () => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		onSettingsChange?: () => void
	) {
		this.container = container
		this.plugin = plugin
		this.onSettingsChange = onSettingsChange
	}

	/**
	 * Renders the settings content
	 */
	render(): void {
		this.container.empty()

		// Connection settings
		this.container.createEl("h2", { text: "Connection settings" })

		new Setting(this.container)
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
					this.onSettingsChange?.()
				})
			})

		new Setting(this.container)
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
					this.onSettingsChange?.()
				})
			})

		this.container.createEl("p", {
			text: "Password is prompted when starting a migration and stored in memory for the session only.",
			cls: "setting-item-description",
		})

		// Sync settings
		this.container.createEl("h2", { text: "Sync settings" })

		// File contents setting
		new Setting(this.container)
			.setName("Include file contents")
			.setDesc("Include the full file contents as a property on nodes")
			.addToggle((toggle) => {
				toggle.setValue(
					this.plugin.settings.includeFileContents ?? DEFAULT_SETTINGS.includeFileContents ?? false
				)
				toggle.onChange(async (value) => {
					this.plugin.settings.includeFileContents = value
					await this.plugin.saveSettings()
					this.onSettingsChange?.()
					// Refresh to show/hide property name input
					this.render()
				})
			})

		// File contents property name (only show if enabled)
		const includeFileContents = this.plugin.settings.includeFileContents ?? DEFAULT_SETTINGS.includeFileContents ?? false
		if (includeFileContents) {
			new Setting(this.container)
				.setName("File contents property name")
				.setDesc("Property name to use for file contents in Neo4j")
				.addText((text) => {
					text.setPlaceholder("file_contents")
					text.setValue(
						this.plugin.settings.fileContentsPropertyName ?? DEFAULT_SETTINGS.fileContentsPropertyName ?? "file_contents"
					)
					text.onChange(async (value) => {
						this.plugin.settings.fileContentsPropertyName = value || DEFAULT_SETTINGS.fileContentsPropertyName
						await this.plugin.saveSettings()
						this.onSettingsChange?.()
					})
				})
		}

		// Batch size setting
		const batchSizeSetting = new Setting(this.container)
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
						this.onSettingsChange?.()
						// Refresh the setting to show/hide number input
						this.render()
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
						this.onSettingsChange?.()
					}
				})
			})
		}
	}
}

