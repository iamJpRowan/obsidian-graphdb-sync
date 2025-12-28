import { setIcon, Notice, Setting } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import type { PropertyInfo, RelationshipMapping } from "../types"
import { ConfigurationService } from "../services/ConfigurationService"
import { RelationshipValidationService } from "../services/RelationshipValidationService"
import type { ValidationResult } from "../types"
import { ValidationBadge } from "./components/ValidationBadge"
import { ValidationIssuesModal } from "./components/ValidationIssuesModal"
import { RelationshipConfigSection } from "./components/RelationshipConfigSection"

/**
 * Property row component with inline configuration
 * Shows property name, type icon, and expandable configuration panel
 */
export class PropertyRow {
	private plugin: GraphDBSyncPlugin
	private property: PropertyInfo
	private container: HTMLElement
	private rowEl: HTMLElement
	private onConfigure: (property: PropertyInfo) => void
	private configPanelVisible: boolean = false
	private configContainer: HTMLElement | null = null
	private additionalItemsContainer: HTMLElement | null = null
	private diagramEl: HTMLElement | null = null
	private relationshipConfigSection: RelationshipConfigSection | null = null
	private mappingTypeSelect: HTMLSelectElement | null = null
	private validationResult: ValidationResult | null = null
	private validationBadge: ValidationBadge | null = null
	private validationBadgeContainer: HTMLElement | null = null
	private isValidating: boolean = false
	private enabledToggle: HTMLInputElement | null = null

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
		// Update initial enabled state
		this.updateRowEnabledState()
	}

	private render(): void {
		// Main row container
		const rowWrapper = this.container.createDiv("graphdb-property-row-wrapper")
		
		this.rowEl = rowWrapper.createDiv("graphdb-property-row")

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
			this.toggleConfigPanel()
		})

		// Container for additional items that can wrap to new rows
		this.additionalItemsContainer = this.rowEl.createDiv("graphdb-property-row-additional-items")

		// Make entire row clickable to toggle configuration
		this.rowEl.style.cursor = "pointer"
		this.rowEl.addEventListener("click", () => {
			this.toggleConfigPanel()
		})

		// Configuration container (hidden by default)
		this.configContainer = rowWrapper.createDiv("graphdb-property-row-config")
		this.configContainer.style.display = "none"
		this.renderConfiguration()
	}

	private renderConfiguration(): void {
		if (!this.configContainer) return
		this.configContainer.empty()

		// Get current mapping if it exists
		const currentMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)
		const nodePropertyMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.property.name
		)

		// Determine current mapping type
		let currentMappingType: "none" | "relationship" | "node_property" = "none"
		if (currentMapping) {
			currentMappingType = "relationship"
		} else if (nodePropertyMapping) {
			currentMappingType = "node_property"
		}

		// Mapping type selector
		const mappingTypeContainer = this.configContainer.createDiv("graphdb-property-config-section")
		const mappingTypeRow = mappingTypeContainer.createDiv("graphdb-property-config-mapping-type-row")
		
		mappingTypeRow.createSpan({ text: "Mapping type: ", cls: "graphdb-property-config-label" })
		this.mappingTypeSelect = mappingTypeRow.createEl("select", {
			cls: "graphdb-property-config-select",
		})
		this.mappingTypeSelect.createEl("option", { text: "None", value: "none" })
		this.mappingTypeSelect.createEl("option", { text: "Relationship", value: "relationship" })
		this.mappingTypeSelect.createEl("option", { text: "Boolean", value: "boolean" })
		this.mappingTypeSelect.createEl("option", { text: "Integer", value: "integer" })
		this.mappingTypeSelect.createEl("option", { text: "Float", value: "float" })
		this.mappingTypeSelect.createEl("option", { text: "Date", value: "date" })
		this.mappingTypeSelect.createEl("option", { text: "String", value: "string" })
		this.mappingTypeSelect.value = currentMappingType
		this.mappingTypeSelect.addEventListener("change", () => {
			this.handleMappingTypeChange()
		})
		
		// Validation badge (just right of mapping type select)
		this.validationBadgeContainer = mappingTypeRow.createDiv("graphdb-validation-badge-container")
		this.validationBadge = new ValidationBadge(this.validationBadgeContainer)
		this.updateValidationBadge()
		
		// Enabled toggle (far right)
		const toggleContainer = mappingTypeRow.createDiv("graphdb-property-config-toggle-container")
		const setting = new Setting(toggleContainer)
		setting.settingEl.style.border = "none"
		setting.settingEl.style.padding = "0"
		setting.settingEl.style.margin = "0"
		setting.settingEl.style.boxShadow = "none"
		setting.controlEl.style.marginLeft = "auto"
		
		let currentEnabled = false
		if (currentMapping) {
			currentEnabled = currentMapping.enabled
		} else if (nodePropertyMapping) {
			currentEnabled = nodePropertyMapping.enabled
		}
		
		setting.addToggle((toggle) => {
			this.enabledToggle = toggle.toggleEl as HTMLInputElement
			toggle.setValue(currentEnabled)
			toggle.onChange(async (value) => {
				await this.handleEnabledToggleChange(value)
			})
		})

		// Relationship-specific configuration
		if (currentMappingType === "relationship") {
			this.renderRelationshipConfig(currentMapping)
			this.renderRelationshipDiagram(currentMapping)
		} else {
			// Clean up relationship config section if switching away
			if (this.relationshipConfigSection) {
				this.relationshipConfigSection = null
			}
		}

		// Update validation badge after rendering
		this.updateValidationBadge()
		
		// Update row enabled state
		this.updateRowEnabledState()
	}

	private renderRelationshipConfig(mapping: RelationshipMapping | null): void {
		if (!this.configContainer) return

		// Create container for relationship config
		const relationshipContainer = this.configContainer.createDiv("graphdb-property-config-section")
		
		// Create and render relationship config section
		this.relationshipConfigSection = new RelationshipConfigSection(
			relationshipContainer,
			this.plugin,
			this.property.name,
			{
				onUpdate: () => {
					// Update diagram when relationship config changes
					this.updateDiagramFromInput()
				},
			}
		)
		this.relationshipConfigSection.render(mapping)
	}

	private renderRelationshipDiagram(mapping: RelationshipMapping | null): void {
		if (!this.additionalItemsContainer) return

		// Remove existing diagram if present
		if (this.diagramEl) {
			this.diagramEl.remove()
			this.diagramEl = null
		}

		// Create diagram in additional items container
		this.diagramEl = this.additionalItemsContainer.createSpan("graphdb-property-row-diagram")
		
		// Update diagram with initial mapping or empty
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

	private updateDiagramFromInput(): void {
		if (!this.relationshipConfigSection) return
		this.relationshipConfigSection.updateDiagram(this.diagramEl)
	}

	private async handleValidate(): Promise<void> {
		const currentMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)

		if (!currentMapping) {
			new Notice("Please configure a relationship mapping first")
			return
		}

		// Set validating state
		this.isValidating = true
		this.updateValidationBadge()

		try {
			this.validationResult = await RelationshipValidationService.validateRelationshipProperty(
				this.plugin.app,
				this.property.name
			)
		} catch (error) {
			new Notice(`Validation error: ${error instanceof Error ? error.message : String(error)}`)
		} finally {
			this.isValidating = false
			this.updateValidationBadge()
		}
	}

	private updateValidationBadge(): void {
		if (!this.validationBadge) return

		if (this.isValidating) {
			this.validationBadge.renderValidating()
		} else if (this.validationResult) {
			if (this.validationResult.isValid) {
				this.validationBadge.renderNoIssues(() => {
					this.handleValidate()
				})
			} else {
				const issueCount = this.validationResult.filesWithIssues.length
				this.validationBadge.renderHasIssues(
					issueCount,
					() => {
						// Open modal
						new ValidationIssuesModal(
							this.plugin,
							this.validationResult!
						).open()
					},
					() => {
						// Right-click: re-run validation
						this.handleValidate()
					}
				)
			}
		} else {
			this.validationBadge.renderNotValidated(() => {
				this.handleValidate()
			})
		}
	}

	private handleMappingTypeChange(): void {
		if (!this.mappingTypeSelect) return

		const mappingType = this.mappingTypeSelect.value

		// Reset validation when mapping type changes
		this.validationResult = null
		this.isValidating = false

		// Remove diagram if switching away from relationship
		if (mappingType !== "relationship" && this.diagramEl) {
			this.diagramEl.remove()
			this.diagramEl = null
		}

		if (mappingType === "none") {
			// Delete mapping
			ConfigurationService.deleteRelationshipMapping(this.plugin, this.property.name)
			ConfigurationService.deleteNodePropertyMapping(this.plugin, this.property.name)
		} else if (mappingType === "relationship") {
			// Create relationship mapping with defaults
			ConfigurationService.saveRelationshipMapping(this.plugin, this.property.name, {
				propertyName: this.property.name,
				relationshipType: "",
				direction: "outgoing",
				enabled: true,
			})
		} else {
			// Create node property mapping
			ConfigurationService.saveNodePropertyMapping(this.plugin, this.property.name, {
				propertyName: this.property.name,
				enabled: true,
			})
		}

		// Re-render configuration
		this.configContainer?.empty()
		this.renderConfiguration()
		
		// Update diagram if relationship mapping
		if (mappingType === "relationship") {
			const currentMapping = ConfigurationService.getRelationshipMapping(
				this.plugin.settings,
				this.property.name
			)
			this.renderRelationshipDiagram(currentMapping)
		}
		
		// Update row enabled state
		this.updateRowEnabledState()
	}

	private async handleEnabledToggleChange(enabled: boolean): Promise<void> {
		const currentMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)
		const nodePropertyMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.property.name
		)

		if (currentMapping) {
			await ConfigurationService.saveRelationshipMapping(this.plugin, this.property.name, {
				...currentMapping,
				enabled,
			})
		} else if (nodePropertyMapping) {
			await ConfigurationService.saveNodePropertyMapping(this.plugin, this.property.name, {
				...nodePropertyMapping,
				enabled,
			})
		}

		// Update row enabled state
		this.updateRowEnabledState()
	}

	private updateRowEnabledState(): void {
		const currentMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)
		const nodePropertyMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.property.name
		)

		const isEnabled = currentMapping?.enabled || nodePropertyMapping?.enabled || false

		// Apply to wrapper - single source of truth for border styling
		const wrapper = this.rowEl.parentElement
		if (wrapper && wrapper.classList.contains("graphdb-property-row-wrapper")) {
			if (isEnabled) {
				wrapper.addClass("graphdb-property-row-wrapper-enabled")
			} else {
				wrapper.removeClass("graphdb-property-row-wrapper-enabled")
			}
		}
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
