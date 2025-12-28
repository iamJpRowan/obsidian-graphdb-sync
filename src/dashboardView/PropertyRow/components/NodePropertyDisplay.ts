import { setIcon } from "obsidian"
import type { NodePropertyMapping } from "../../../types"

/**
 * Node property display component
 * Displays the node property name with type icon
 */
export class NodePropertyDisplay {
	private container: HTMLElement
	private displayEl: HTMLElement | null = null

	constructor(container: HTMLElement) {
		this.container = container
	}

	/**
	 * Renders or updates the display based on the mapping
	 */
	render(mapping: NodePropertyMapping | null): void {
		// Remove existing display if present
		if (this.displayEl) {
			this.displayEl.remove()
			this.displayEl = null
		}

		// Create display in container (same location as relationship diagram)
		this.displayEl = this.container.createSpan("graphdb-property-row-diagram")
		
		// Update display with node property name and icon
		if (mapping && mapping.nodePropertyName) {
			// Create icon for the mapping type
			const iconEl = this.displayEl.createSpan("graphdb-property-row-diagram-icon")
			setIcon(iconEl, this.getNodePropertyTypeIcon(mapping.nodePropertyType))
			
			// Add the property name with spacing
			this.displayEl.createSpan({ text: mapping.nodePropertyName, cls: "graphdb-property-row-diagram-text" })
		} else {
			this.displayEl.setText("")
		}
	}

	/**
	 * Removes the display element
	 */
	remove(): void {
		if (this.displayEl) {
			this.displayEl.remove()
			this.displayEl = null
		}
	}

	/**
	 * Gets the icon for a node property mapping type
	 */
	private getNodePropertyTypeIcon(nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"): string {
		const iconMap: Record<string, string> = {
			boolean: "check-square",
			integer: "hash",
			float: "hash",
			date: "calendar",
			datetime: "clock",
			string: "type",
			list_string: "list",
		}
		return iconMap[nodePropertyType] || "help-circle"
	}
}

