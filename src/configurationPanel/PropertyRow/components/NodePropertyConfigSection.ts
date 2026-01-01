import type GraphDBSyncPlugin from "../../../main"
import type { NodePropertyMapping } from "../../../types"
import { ConfigurationService } from "../../../services/ConfigurationService"
import { debounce } from "../../../utils/debounce"

/**
 * Node property configuration section component
 * Handles rendering and interaction for node property name configuration
 */
export class NodePropertyConfigSection {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private container: HTMLElement
	private nodePropertyNameInput: HTMLInputElement | null = null
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
	 * Renders the node property configuration UI
	 */
	render(mapping: NodePropertyMapping | null): void {
		const nodePropertyContainer = this.container.createDiv("graphdb-property-config-section")

		// Node property name input (inline label)
		const nameRow = nodePropertyContainer.createDiv("graphdb-property-config-type-direction-row")
		nameRow.createSpan({ text: "Node property name: ", cls: "graphdb-property-config-label" })
		this.nodePropertyNameInput = nameRow.createEl("input", {
			type: "text",
			cls: "graphdb-property-config-input",
			value: mapping?.nodePropertyName || this.propertyName,
			placeholder: this.propertyName,
		})

		// Intercept space key to convert to underscore before typing (similar to relationship type)
		this.nodePropertyNameInput.addEventListener("keydown", (e) => {
			if (e.key === " ") {
				e.preventDefault()
				const input = this.nodePropertyNameInput!
				const start = input.selectionStart || 0
				const end = input.selectionEnd || 0
				const value = input.value
				const newValue = value.substring(0, start) + "_" + value.substring(end)
				input.value = newValue
				input.setSelectionRange(start + 1, start + 1)
				this.handleNodePropertyNameInput()
			}
		})

		this.nodePropertyNameInput.addEventListener("input", () => {
			this.handleNodePropertyNameInput()
		})
	}

	/**
	 * Gets the current node property name value
	 */
	getNodePropertyName(): string {
		return this.nodePropertyNameInput?.value || this.propertyName
	}

	private handleNodePropertyNameInput(): void {
		if (!this.nodePropertyNameInput) return

		const input = this.nodePropertyNameInput
		const cursorPosition = input.selectionStart || 0
		const value = input.value

		// Remove invalid characters (keep only A-Z, 0-9, _)
		// Track how many invalid chars were before cursor to adjust position
		let invalidCharsBeforeCursor = 0
		for (let i = 0; i < Math.min(cursorPosition, value.length); i++) {
			if (!/[A-Z0-9_]/i.test(value[i])) {
				invalidCharsBeforeCursor++
			}
		}

		const corrected = value.replace(/[^A-Z0-9_]/gi, "")

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
				this.saveNodePropertyMapping()
			}, 500)
		}
		this.debouncedSave()
	}

	private async saveNodePropertyMapping(): Promise<void> {
		if (!this.nodePropertyNameInput) return

		const currentMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.propertyName
		)

		if (!currentMapping) {
			return
		}

		// Clean up node property name: collapse multiple underscores, remove leading/trailing
		const nodePropertyName = this.nodePropertyNameInput.value
			.replace(/_+/g, "_") // Collapse multiple underscores
			.replace(/^_|_$/g, "") // Remove leading/trailing underscores

		// Update input field to show the cleaned-up value that will be saved
		if (this.nodePropertyNameInput.value !== nodePropertyName) {
			this.nodePropertyNameInput.value = nodePropertyName
		}

		// Use property name as fallback if cleaned value is empty
		const finalName = nodePropertyName || this.propertyName

		await ConfigurationService.saveNodePropertyMapping(this.plugin, this.propertyName, {
			propertyName: this.propertyName,
			nodePropertyType: currentMapping.nodePropertyType,
			nodePropertyName: finalName,
			enabled: currentMapping.enabled,
		})

		// Notify update
		if (this.onUpdate) {
			this.onUpdate()
		}
	}
}

