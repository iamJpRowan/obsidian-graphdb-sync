import type GraphDBSyncPlugin from "../../main"
import type { PropertyInfo } from "../../types"
import { setIcon } from "obsidian"
import { ConfigurationService } from "../../services/ConfigurationService"
import { PropertyRowHeader } from "./components/PropertyRowHeader"
import { RelationshipDiagram } from "./components/RelationshipDiagram"
import { NodePropertyDisplay } from "./components/NodePropertyDisplay"
import { ValidationHandler } from "./handlers/ValidationHandler"
import { MappingTypeHandler } from "./handlers/MappingTypeHandler"
import { PropertySyncHandler } from "./handlers/PropertySyncHandler"
import { SyncQueueService } from "../../services/SyncQueueService"
import { ConfigurationPanel } from "./components/ConfigurationPanel"
import { getPropertyRowState } from "./utils/PropertyRowState"
import "./styles.css"

/**
 * Property row component with inline configuration
 * Shows property name, type icon, and expandable configuration panel
 */
export class PropertyRow {
	private plugin: GraphDBSyncPlugin
	private property: PropertyInfo
	private container: HTMLElement
	private rowEl: HTMLElement
	private configPanelVisible: boolean = false
	private configContainer: HTMLElement | null = null
	private additionalItemsContainer: HTMLElement | null = null
	private header: PropertyRowHeader | null = null
	private relationshipDiagram: RelationshipDiagram | null = null
	private nodePropertyDisplay: NodePropertyDisplay | null = null
	private validationHandler: ValidationHandler
	private mappingTypeHandler: MappingTypeHandler
	private syncHandler: PropertySyncHandler
	private configurationPanel: ConfigurationPanel | null = null

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		property: PropertyInfo
	) {
		this.container = container
		this.plugin = plugin
		this.property = property
		
		// Initialize handlers
		this.validationHandler = new ValidationHandler(plugin, property.name)
		this.mappingTypeHandler = new MappingTypeHandler(plugin, property.name, {
			onCleanupDisplays: () => this.cleanupDisplays(),
			onRenderConfiguration: () => this.renderConfiguration(),
			onRenderRelationshipDiagram: (mapping) => this.renderRelationshipDiagram(mapping),
			onRenderNodePropertyName: (mapping) => this.renderNodePropertyName(mapping),
			onUpdateRowEnabledState: () => this.updateRowEnabledState(),
		})
		this.syncHandler = new PropertySyncHandler(
			plugin,
			property.name,
			(state) => {
				// Update sync icon state in configuration panel
				if (this.configurationPanel) {
					this.configurationPanel.updateSyncState(state)
				}
			}
		)

		this.render()
		// Update initial enabled state
		this.updateRowEnabledState()
	}

	private render(): void {
		// Main row container
		const rowWrapper = this.container.createDiv("graphdb-property-row-wrapper")
		
		// Configuration cog (positioned absolutely at top right)
		const cogEl = rowWrapper.createSpan("graphdb-property-row-cog")
		setIcon(cogEl, "gear")
		cogEl.addEventListener("click", (e) => {
			e.stopPropagation() // Prevent row click from firing
			this.toggleConfigPanel()
		})
		
		this.rowEl = rowWrapper.createDiv("graphdb-property-row")

		// Render header (icon, name, occurrences)
		this.header = new PropertyRowHeader(
			this.rowEl,
			this.property,
			() => this.toggleConfigPanel()
		)

		// Container for additional items that can wrap to new rows
		this.additionalItemsContainer = this.rowEl.createDiv("graphdb-property-row-additional-items")

		// Configuration container (hidden by default)
		this.configContainer = rowWrapper.createDiv("graphdb-property-row-config")
		this.renderConfiguration()
		
		// Render initial mapping display if one exists
		this.renderInitialMappingDisplay()
	}

	private renderConfiguration(): void {
		if (!this.configContainer) return

		// Create configuration panel
		this.configurationPanel = new ConfigurationPanel(
			this.configContainer,
			this.plugin,
			this.property.name,
			{
				onMappingTypeChange: (mappingType) => this.handleMappingTypeChange(mappingType),
				onEnabledToggleChange: (enabled) => this.handleEnabledToggleChange(enabled),
				onUpdateDiagram: () => this.updateDiagramFromInput(),
				onUpdateNodePropertyDisplay: () => this.updateNodePropertyDisplay(),
				onSyncClick: () => this.syncHandler.handleSync(),
			}
		)
		
		// Render panel and get validation badge container
		const validationBadgeContainer = this.configurationPanel.render()
		
		// Render validation badge
		this.validationHandler.render(validationBadgeContainer)

		// Update row enabled state
		this.updateRowEnabledState()
	}

	private renderRelationshipDiagram(mapping: import("../../types").RelationshipMapping | null): void {
		if (!this.additionalItemsContainer) return

		// Remove existing diagram if present
		if (this.relationshipDiagram) {
			this.relationshipDiagram.remove()
			this.relationshipDiagram = null
		}

		// Create and render diagram
		this.relationshipDiagram = new RelationshipDiagram(this.additionalItemsContainer)
		this.relationshipDiagram.render(mapping)
	}

	private updateDiagramFromInput(): void {
		if (!this.configurationPanel || !this.relationshipDiagram) return
		const relationshipConfigSection = this.configurationPanel.getRelationshipConfigSection()
		if (!relationshipConfigSection) return

		const relationshipType = relationshipConfigSection.getRelationshipType()
		const direction = relationshipConfigSection.getDirection()
		this.relationshipDiagram.update(relationshipType, direction)
	}

	private renderNodePropertyName(mapping: import("../../types").NodePropertyMapping | null): void {
		if (!this.additionalItemsContainer) return

		// Remove existing display if present
		if (this.nodePropertyDisplay) {
			this.nodePropertyDisplay.remove()
			this.nodePropertyDisplay = null
		}

		// Create and render display
		this.nodePropertyDisplay = new NodePropertyDisplay(this.additionalItemsContainer)
		this.nodePropertyDisplay.render(mapping)
	}

	private updateNodePropertyDisplay(): void {
		const state = getPropertyRowState(this.plugin, this.property.name)
		this.renderNodePropertyName(state.nodeProperty)
	}

	private renderInitialMappingDisplay(): void {
		const state = getPropertyRowState(this.plugin, this.property.name)
		
		if (state.relationship) {
			this.renderRelationshipDiagram(state.relationship)
		} else if (state.nodeProperty) {
			this.renderNodePropertyName(state.nodeProperty)
		}
	}

	private cleanupDisplays(): void {
		if (this.relationshipDiagram) {
			this.relationshipDiagram.remove()
			this.relationshipDiagram = null
		}
		if (this.nodePropertyDisplay) {
			this.nodePropertyDisplay.remove()
			this.nodePropertyDisplay = null
		}
	}

	private handleMappingTypeChange(mappingType: string): void {
		// Reset validation when mapping type changes
		this.validationHandler.reset()
		
		// Handle the mapping type change
		this.mappingTypeHandler.handleChange(mappingType)
		
		// Show/hide validation badge container based on mapping type
		if (this.configurationPanel) {
			const validationBadgeContainer = this.configurationPanel.getValidationBadgeContainer()
			if (validationBadgeContainer) {
				if (mappingType === "none") {
					validationBadgeContainer.addClass("graphdb-validation-badge-container-hidden")
				} else {
					validationBadgeContainer.removeClass("graphdb-validation-badge-container-hidden")
					// Auto-validate when a mapping type is selected
					this.validationHandler.validate()
				}
			}
		}
	}

	private async handleEnabledToggleChange(enabled: boolean): Promise<void> {
		const state = getPropertyRowState(this.plugin, this.property.name)

		if (state.relationship) {
			await ConfigurationService.saveRelationshipMapping(this.plugin, this.property.name, {
				...state.relationship,
				enabled,
			})
		} else if (state.nodeProperty) {
			await ConfigurationService.saveNodePropertyMapping(this.plugin, this.property.name, {
				...state.nodeProperty,
				enabled,
			})
		}

		// If enabling a property, add it to active full sync if one exists
		if (enabled) {
			const syncType = state.mappingType === "relationship" ? "relationship-sync" : "property-sync"
			SyncQueueService.addPropertyToActiveFullSync(
				this.property.name,
				syncType,
				this.plugin.settings
			)
		}

		// Update row enabled state
		this.updateRowEnabledState()
	}

	private updateRowEnabledState(): void {
		const state = getPropertyRowState(this.plugin, this.property.name)

		// Apply to wrapper - single source of truth for border styling
		const wrapper = this.rowEl.parentElement
		if (wrapper && wrapper.classList.contains("graphdb-property-row-wrapper")) {
			if (state.isEnabled) {
				wrapper.addClass("graphdb-property-row-wrapper-enabled")
			} else {
				wrapper.removeClass("graphdb-property-row-wrapper-enabled")
			}
		}
	}

	private toggleConfigPanel(): void {
		if (!this.configContainer) return

		this.configPanelVisible = !this.configPanelVisible

		if (this.configPanelVisible) {
			this.configContainer.addClass("graphdb-property-row-config-visible")
			this.rowEl.addClass("graphdb-property-row-expanded")
			// Auto-validate when expanding (if mapping is configured)
			const state = getPropertyRowState(this.plugin, this.property.name)
			if (state.mappingType !== "none") {
				this.validationHandler.validate()
			}
		} else {
			this.configContainer.removeClass("graphdb-property-row-config-visible")
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
		this.syncHandler.destroy()
		this.rowEl.parentElement?.remove()
	}
}
