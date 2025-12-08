import type { PropertyMapping, RelationshipMappingConfig } from "../../types"
import { Neo4jService } from "../../services/Neo4jService"
import { createConfigForMappingType, createRelationshipConfig } from "./configHelpers"

/**
 * Creates a compact inline form row with mapping type selector
 * Note: Enable toggle is now only in the card header
 */
export function createMappingTypeRow(
	container: HTMLElement,
	mapping: PropertyMapping,
	onChange: (mapping: PropertyMapping) => void
): HTMLElement {
	const row = container.createDiv("graphdb-config-inline-row")

	// Mapping type selector
	const typeContainer = row.createDiv("graphdb-config-inline-item")
	typeContainer.createSpan({
		text: "Mapping type",
		cls: "graphdb-config-label",
	})
	const dropdown = typeContainer.createEl("select", {
		cls: "graphdb-config-dropdown",
	})
	dropdown.appendChild(new Option("None", ""))
	dropdown.appendChild(new Option("Relationship", "relationship"))
	dropdown.appendChild(new Option("Node property", "node_property"))
	dropdown.value = mapping.mappingType || ""
	dropdown.addEventListener("change", (e) => {
		const value = (e.target as HTMLSelectElement).value
		if (value === "") {
			mapping.mappingType = undefined
			mapping.config = undefined
			mapping.enabled = false // Disable toggle when "None" is selected
		} else {
			mapping.mappingType = value as "relationship" | "node_property"
			// Always create fresh config when switching to a mapping type
			// This ensures we don't reuse old values from previous configurations
			mapping.config = createConfigForMappingType(mapping.mappingType)
		}
		onChange(mapping)
	})

	return row
}

/**
 * Creates a node property configuration area with "coming soon" placeholder
 */
export function createNodePropertyField(
	container: HTMLElement
): HTMLElement {
	const fieldContainer = container.createDiv("graphdb-config-node-property-field")
	
	// Coming soon placeholder
	const placeholder = fieldContainer.createDiv("graphdb-config-coming-soon")
	placeholder.createSpan({
		text: "Coming soon",
		cls: "graphdb-config-coming-soon-text",
	})
	placeholder.createSpan({
		text: "Node property configuration will be available in a future update.",
		cls: "graphdb-config-coming-soon-description",
	})
	
	return fieldContainer
}

/**
 * Creates a relationship configuration field with name input, direction selector, and preview
 */
export function createRelationshipField(
	container: HTMLElement,
	mapping: PropertyMapping,
	propertyName: string,
	onChange: (mapping: PropertyMapping) => void
): {
	fieldContainer: HTMLElement
	errorEl: HTMLElement | null
} {
	const fieldContainer = container.createDiv("graphdb-config-relationship-field")
	let errorEl: HTMLElement | null = null

	// Label
	fieldContainer.createSpan({
		text: "Relationship",
		cls: "graphdb-config-label",
	})

	// Helper text (above input)
	fieldContainer.createSpan({
		text: "Must be UPPER_SNAKE_CASE (uppercase letters, numbers, underscores only)",
		cls: "graphdb-config-helper-text",
	})

	// Input row
	const inputRow = fieldContainer.createDiv("graphdb-config-relationship-input-row")

	// Name input container
	const nameInputContainer = inputRow.createDiv("graphdb-config-relationship-name-container")
	const nameInput = nameInputContainer.createEl("input", {
		type: "text",
		cls: "graphdb-config-relationship-name-input",
		placeholder: "e.g., RELATES_TO, REFERENCES",
	})
	const relConfig: RelationshipMappingConfig = (mapping.config && "relationshipType" in mapping.config)
		? (mapping.config as RelationshipMappingConfig)
		: { relationshipType: "", direction: "outgoing" }
	nameInput.value = relConfig.relationshipType || ""

	// Direction toggle button (single click to change)
	const directionContainer = inputRow.createDiv("graphdb-config-relationship-direction-container")
	const directionButton = directionContainer.createEl("button", {
		cls: "graphdb-config-relationship-direction-button",
		type: "button",
	})
	const updateDirectionButton = () => {
		const isOutgoing = relConfig.direction === "outgoing"
		directionButton.textContent = isOutgoing ? "Outgoing →" : "Incoming ←"
		directionButton.setAttribute("data-direction", relConfig.direction || "outgoing")
	}
	updateDirectionButton()

	// Error container (below input, in its own row)
	const errorRow = fieldContainer.createDiv("graphdb-config-error-row")
	const errorContainer = errorRow.createDiv("graphdb-config-error-container")

	// Name input handler
	nameInput.addEventListener("input", () => {
		const value = nameInput.value
		if (!mapping.config || !("relationshipType" in mapping.config)) {
			mapping.config = createRelationshipConfig()
		}
		const config = mapping.config as RelationshipMappingConfig
		config.relationshipType = value

		// Real-time validation
		const validation = Neo4jService.validateRelationshipType(value)

		// Update error display
		if (errorEl) {
			errorEl.remove()
			errorEl = null
		}

		if (!validation.isValid && value.length > 0) {
			errorEl = errorContainer.createSpan({
				cls: "graphdb-config-error-text",
				text: validation.error || "Invalid relationship type",
			})
		}

		onChange(mapping)
	})

	// Direction toggle handler (single click to change)
	directionButton.addEventListener("click", () => {
		const currentDirection = relConfig.direction || "outgoing"
		const newDirection: "outgoing" | "incoming" = currentDirection === "outgoing" ? "incoming" : "outgoing"
		
		if (!mapping.config || !("relationshipType" in mapping.config)) {
			mapping.config = createRelationshipConfig()
			mapping.config.relationshipType = nameInput.value
		}
		const config = mapping.config as RelationshipMappingConfig
		config.direction = newDirection
		relConfig.direction = newDirection
		updateDirectionButton()
		onChange(mapping)
	})

	// Initial validation if value exists
	if (relConfig.relationshipType) {
		const validation = Neo4jService.validateRelationshipType(relConfig.relationshipType)
		if (!validation.isValid) {
			errorEl = errorContainer.createSpan({
				cls: "graphdb-config-error-text",
				text: validation.error || "Invalid relationship type",
			})
		}
	}

	return {
		fieldContainer,
		errorEl,
	}
}

