import type { RelationshipMapping } from "../../../types"

/**
 * Relationship diagram component
 * Displays a text-based diagram showing the relationship structure
 */
export class RelationshipDiagram {
	private container: HTMLElement
	private diagramEl: HTMLElement | null = null

	constructor(container: HTMLElement) {
		this.container = container
	}

	/**
	 * Renders or updates the diagram based on the mapping
	 */
	render(mapping: RelationshipMapping | null): void {
		// Remove existing diagram if present
		if (this.diagramEl) {
			this.diagramEl.remove()
			this.diagramEl = null
		}

		// Create diagram in container
		this.diagramEl = this.container.createSpan("graphdb-property-row-diagram")
		
		// Update diagram with mapping or empty
		if (mapping && mapping.relationshipType) {
			const relationshipType = mapping.relationshipType.toUpperCase()
			if (mapping.direction === "outgoing") {
				this.diagramEl.setText(`(File)-[${relationshipType}]->(Target)`)
			} else {
				this.diagramEl.setText(`(Target)-[${relationshipType}]->(File)`)
			}
		} else {
			this.diagramEl.setText("")
		}
	}

	/**
	 * Updates the diagram based on relationship type and direction
	 */
	update(relationshipType: string, direction: "outgoing" | "incoming"): void {
		if (!this.diagramEl) {
			this.diagramEl = this.container.createSpan("graphdb-property-row-diagram")
		}

		const type = relationshipType.toUpperCase()
		if (!type) {
			this.diagramEl.setText("")
			return
		}

		if (direction === "outgoing") {
			this.diagramEl.setText(`(File)-[${type}]->(Target)`)
		} else {
			this.diagramEl.setText(`(Target)-[${type}]->(File)`)
		}
	}

	/**
	 * Removes the diagram element
	 */
	remove(): void {
		if (this.diagramEl) {
			this.diagramEl.remove()
			this.diagramEl = null
		}
	}
}

