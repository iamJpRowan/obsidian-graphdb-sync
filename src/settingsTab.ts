import { PluginSettingTab } from "obsidian"
import type GraphDBSyncPlugin from "./main"
import { SettingsTabContent } from "./configurationPanel/components/SettingsTabContent"

/**
 * Settings tab for GraphDB Sync plugin
 * Uses the reusable SettingsTabContent component
 */
export class SettingsTab extends PluginSettingTab {
	plugin: GraphDBSyncPlugin
	private settingsContent: SettingsTabContent | null = null

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		this.settingsContent = new SettingsTabContent(
			containerEl,
			this.plugin
		)
		this.settingsContent.render()
	}
}


