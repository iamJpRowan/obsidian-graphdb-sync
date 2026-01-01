import type GraphDBSyncPlugin from "../main"
import { SettingsTabContent } from "./components/SettingsTabContent"

/**
 * Settings tab for dashboard
 * Wraps the reusable SettingsTabContent component
 */
export class SettingsTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private settingsContent: SettingsTabContent | null = null

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin
	) {
		this.container = container
		this.plugin = plugin
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.settingsContent = new SettingsTabContent(
			this.container,
			this.plugin
		)
		this.settingsContent.render()
	}

	/**
	 * Refreshes the tab
	 */
	refresh(): void {
		if (this.settingsContent) {
			this.settingsContent.render()
		}
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		// SettingsTabContent doesn't need explicit cleanup
		this.settingsContent = null
	}
}

