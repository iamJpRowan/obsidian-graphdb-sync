import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { openSettings } from "../../utils/obsidianApi"

/**
 * Simple settings link component
 */
export class SettingsLink {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin) {
		this.container = container
		this.plugin = plugin
	}

	/**
	 * Renders the settings link
	 */
	render(): void {
		this.container.empty()
		this.container.addClass("graphdb-settings-link")

		const link = this.container.createDiv("graphdb-settings-link-button")
		const icon = link.createSpan("graphdb-settings-link-icon")
		setIcon(icon, "settings")
		link.setAttr("title", "Open settings")
		link.addClass("clickable-icon")
		
		link.addEventListener("click", () => {
			openSettings(this.plugin.app)
		})
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		// No cleanup needed
	}
}

