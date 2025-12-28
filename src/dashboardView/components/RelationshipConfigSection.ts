import type GraphDBSyncPlugin from "../../main"
import type { RelationshipMapping } from "../../types"
import { ConfigurationService } from "../../services/ConfigurationService"
import { debounce } from "../../utils/debounce"

/**
 * Relationship configuration section component
 * Handles rendering and interaction for relationship type and direction configuration
 */
export class RelationshipConfigSection {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private container: HTMLElement
	private relationshipTypeInput: HTMLInputElement | null = null
	private directionButton: HTMLElement | null = null
	private currentDirection: "outgoing" | "incoming" = "outgoing"
	private debouncedSave: (() => void) | null = null
	private onUpdate: (() => void) | null = null

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		callbacks: {
			onUpdate?: () => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.propertyName = propertyName
		this.onUpdate = callbacks.onUpdate || null
	}

	/**
	 * Renders the relationship configuration UI
	 */
	render(mapping: RelationshipMapping | null): void {
		const relationshipContainer = this.container.createDiv("graphdb-property-config-section")

		// Relationship type and direction on same row
		const typeDirectionRow = relationshipContainer.createDiv("graphdb-property-config-type-direction-row")
		
		// Relationship type input (inline label)
		typeDirectionRow.createSpan({ text: "Relationship type: ", cls: "graphdb-property-config-label" })
		this.relationshipTypeInput = typeDirectionRow.createEl("input", {
			type: "text",
			cls: "graphdb-property-config-input",
			value: mapping?.relationshipType || "",
			placeholder: "e.g., RELATED_TO, DEPENDS_ON",
		})
		// Intercept space key to convert to underscore before typing
		this.relationshipTypeInput.addEventListener("keydown", (e) => {
			if (e.key === " ") {
				e.preventDefault()
				const input = this.relationshipTypeInput!
				const start = input.selectionStart || 0
				const end = input.selectionEnd || 0
				const value = input.value
				const newValue = value.substring(0, start) + "_" + value.substring(end)
				input.value = newValue
				input.setSelectionRange(start + 1, start + 1)
				this.handleRelationshipTypeInput()
			}
		})
		this.relationshipTypeInput.addEventListener("input", () => {
			this.handleRelationshipTypeInput()
		})

		// Direction button (clickable text) - on same row if space allows
		const directionContainer = typeDirectionRow.createDiv("graphdb-property-config-direction-container")
		this.currentDirection = mapping?.direction || "outgoing"
		this.directionButton = directionContainer.createSpan("graphdb-property-config-direction-button")
		if (this.directionButton) {
			this.directionButton.addClass("clickable-icon")
			this.directionButton.setText(this.currentDirection === "outgoing" ? "Outgoing" : "Incoming")
			this.directionButton.addEventListener("click", () => {
				this.handleDirectionChange()
			})
		}
	}

	/**
	 * Gets the current relationship type value
	 */
	getRelationshipType(): string {
		return this.relationshipTypeInput?.value || ""
	}

	/**
	 * Gets the current direction
	 */
	getDirection(): "outgoing" | "incoming" {
		return this.currentDirection
	}

	/**
	 * Updates the diagram based on current input values
	 */
	updateDiagram(diagramEl: HTMLElement | null): void {
		if (!diagramEl || !this.relationshipTypeInput) return

		const relationshipType = this.relationshipTypeInput.value.toUpperCase()

		if (!relationshipType) {
			diagramEl.setText("")
			return
		}

		if (this.currentDirection === "outgoing") {
			diagramEl.setText(`(File)-[${relationshipType}]->(Target)`)
		} else {
			diagramEl.setText(`(Target)-[${relationshipType}]->(File)`)
		}
	}

	private handleRelationshipTypeInput(): void {
		if (!this.relationshipTypeInput) return

		const input = this.relationshipTypeInput
		const cursorPosition = input.selectionStart || 0
		const value = input.value

		// Only convert to uppercase and remove invalid characters
		// Spaces are already handled by keydown event
		let corrected = value.toUpperCase()

		// Remove invalid characters (keep only A-Z, 0-9, _)
		// Track how many invalid chars were before cursor to adjust position
		let invalidCharsBeforeCursor = 0
		for (let i = 0; i < Math.min(cursorPosition, value.length); i++) {
			if (!/[A-Z0-9_]/i.test(value[i])) {
				invalidCharsBeforeCursor++
			}
		}

		corrected = corrected.replace(/[^A-Z0-9_]/g, "")

		// Calculate new cursor position
		const newCursorPosition = Math.max(0, Math.min(
			cursorPosition - invalidCharsBeforeCursor,
			corrected.length
		))

		if (value !== corrected) {
			input.value = corrected
			// Restore cursor position
			setTimeout(() => {
				if (input) {
					input.setSelectionRange(newCursorPosition, newCursorPosition)
				}
			}, 0)
		}

		// Debounced save
		if (!this.debouncedSave) {
			this.debouncedSave = debounce(() => {
				this.saveRelationshipMapping()
			}, 500)
		}
		this.debouncedSave()
	}

	private handleDirectionChange(): void {
		// Toggle direction
		this.currentDirection = this.currentDirection === "outgoing" ? "incoming" : "outgoing"
		
		// Update button text
		if (this.directionButton) {
			this.directionButton.setText(this.currentDirection === "outgoing" ? "Outgoing" : "Incoming")
		}
		
		// Save and notify update
		this.saveRelationshipMapping()
		if (this.onUpdate) {
			this.onUpdate()
		}
	}

	private async saveRelationshipMapping(): Promise<void> {
		if (!this.relationshipTypeInput) return

		const currentMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.propertyName
		)

		if (!currentMapping) {
			return
		}

		// Clean up relationship type: collapse multiple underscores, remove leading/trailing
		const relationshipType = this.relationshipTypeInput.value
			.replace(/_+/g, "_") // Collapse multiple underscores
			.replace(/^_|_$/g, "") // Remove leading/trailing underscores

		// Update input field to show the cleaned-up value that will be saved
		if (this.relationshipTypeInput.value !== relationshipType) {
			this.relationshipTypeInput.value = relationshipType
		}

		await ConfigurationService.saveRelationshipMapping(this.plugin, this.propertyName, {
			propertyName: this.propertyName,
			relationshipType: relationshipType,
			direction: this.currentDirection,
			enabled: currentMapping.enabled,
		})

		// Notify update
		if (this.onUpdate) {
			this.onUpdate()
		}
	}
}

