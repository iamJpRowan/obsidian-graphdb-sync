import { setIcon } from "obsidian"
import type { PropertyInfo } from "../../../types"

/**
 * Property row header component
 * Displays type icon, property name, occurrences, and configuration cog
 */
export class PropertyRowHeader {
	private property: PropertyInfo
	private rowEl: HTMLElement
	private onToggleConfig: () => void

	constructor(
		rowEl: HTMLElement,
		property: PropertyInfo,
		onToggleConfig: () => void
	) {
		this.rowEl = rowEl
		this.property = property
		this.onToggleConfig = onToggleConfig
		this.render()
	}

	private render(): void {
		// First row group: icon and name (always together on first row)
		const firstRowGroup = this.rowEl.createDiv("graphdb-property-row-first-group")
		
		// Type icon (left)
		const iconEl = firstRowGroup.createSpan("graphdb-property-row-icon")
		setIcon(iconEl, this.getTypeIcon())

		// Property name and details
		const nameContainer = firstRowGroup.createDiv("graphdb-property-row-name-container")
		const nameEl = nameContainer.createDiv("graphdb-property-row-name")
		nameEl.setText(this.property.name)

		if (this.property.occurrences !== undefined) {
			const occurrencesEl = nameContainer.createSpan("graphdb-property-row-occurrences")
			occurrencesEl.setText(`(${this.property.occurrences})`)
		}

		// Configuration cog (far right)
		const cogEl = this.rowEl.createSpan("graphdb-property-row-cog")
		setIcon(cogEl, "gear")
		cogEl.addEventListener("click", (e) => {
			e.stopPropagation() // Prevent row click from firing
			this.onToggleConfig()
		})

		// Make entire row clickable to toggle configuration
		this.rowEl.addEventListener("click", () => {
			this.onToggleConfig()
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
}

