import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import type { PropertyInfo } from "../types"

/**
 * Minimal property row component
 * Shows property name, type icon, and configuration cog
 */
export class PropertyRow {
	private plugin: GraphDBSyncPlugin
	private property: PropertyInfo
	private container: HTMLElement
	private rowEl: HTMLElement
	private onConfigure: (property: PropertyInfo) => void
	private configPanelVisible: boolean = false

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		property: PropertyInfo,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.property = property
		this.onConfigure = callbacks.onConfigure
		this.render()
	}

	private configContainer: HTMLElement | null = null

	private render(): void {
		// Main row container
		const rowWrapper = this.container.createDiv("graphdb-property-row-wrapper")
		
		this.rowEl = rowWrapper.createDiv("graphdb-property-row")

		// Type icon (left)
		const iconEl = this.rowEl.createSpan("graphdb-property-row-icon")
		setIcon(iconEl, this.getTypeIcon())

		// Property name and details
		const nameContainer = this.rowEl.createDiv("graphdb-property-row-name-container")
		const nameEl = nameContainer.createDiv("graphdb-property-row-name")
		nameEl.setText(this.property.name)
		
		if (this.property.occurrences !== undefined) {
			const occurrencesEl = nameContainer.createSpan("graphdb-property-row-occurrences")
			occurrencesEl.setText(`(${this.property.occurrences})`)
		}

		// Configuration cog (right)
		const cogEl = this.rowEl.createSpan("graphdb-property-row-cog")
		setIcon(cogEl, "gear")
		cogEl.addEventListener("click", () => {
			this.toggleConfigPanel()
		})

		// Configuration container (hidden by default)
		this.configContainer = rowWrapper.createDiv("graphdb-property-row-config")
		this.configContainer.style.display = "none"
		this.configContainer.createDiv({
			text: "Configuration details will appear here",
			cls: "graphdb-property-config-placeholder",
		})
	}

	private getTypeIcon(): string {
		// Map Obsidian widget types to icons based on Obsidian's UI
		const widgetIconMap: Record<string, string> = {
			aliases: "link",
			checkbox: "check-square",
			date: "calendar",
			datetime: "clock",
			multitext: "list",
			number: "hash",
			tags: "tag",
			text: "type",
			unknown: "help-circle",
		}
		return widgetIconMap[this.property.type] || "file-text"
	}

	private toggleConfigPanel(): void {
		if (!this.configContainer) return

		this.configPanelVisible = !this.configPanelVisible

		if (this.configPanelVisible) {
			this.configContainer.style.display = "block"
			this.rowEl.addClass("graphdb-property-row-expanded")
		} else {
			this.configContainer.style.display = "none"
			this.rowEl.removeClass("graphdb-property-row-expanded")
		}
	}

	/**
	 * Gets the property name
	 */
	getPropertyName(): string {
		return this.property.name
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.rowEl.parentElement?.remove()
	}
}
