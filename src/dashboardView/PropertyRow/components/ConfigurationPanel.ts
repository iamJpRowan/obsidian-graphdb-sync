import type GraphDBSyncPlugin from "../../../main"
import type { RelationshipMapping, NodePropertyMapping } from "../../../types"
import { MappingTypeSelector } from "./MappingTypeSelector"
import { EnabledToggle } from "./EnabledToggle"
import { RelationshipConfigSection } from "./RelationshipConfigSection"
import { NodePropertyConfigSection } from "./NodePropertyConfigSection"
import { getPropertyRowState } from "../utils/PropertyRowState"

/**
 * Configuration panel component
 * Handles rendering the entire configuration panel with all its sections
 */
export class ConfigurationPanel {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private container: HTMLElement
	private mappingTypeSelector: MappingTypeSelector | null = null
	private enabledToggle: EnabledToggle | null = null
	private relationshipConfigSection: RelationshipConfigSection | null = null
	private nodePropertyConfigSection: NodePropertyConfigSection | null = null
	private onMappingTypeChange: (mappingType: string) => void
	private onEnabledToggleChange: (enabled: boolean) => Promise<void>
	private onUpdateDiagram: () => void
	private onUpdateNodePropertyDisplay: () => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		callbacks: {
			onMappingTypeChange: (mappingType: string) => void
			onEnabledToggleChange: (enabled: boolean) => Promise<void>
			onUpdateDiagram: () => void
			onUpdateNodePropertyDisplay: () => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.propertyName = propertyName
		this.onMappingTypeChange = callbacks.onMappingTypeChange
		this.onEnabledToggleChange = callbacks.onEnabledToggleChange
		this.onUpdateDiagram = callbacks.onUpdateDiagram
		this.onUpdateNodePropertyDisplay = callbacks.onUpdateNodePropertyDisplay
	}

	/**
	 * Renders the entire configuration panel
	 */
	render(): HTMLElement {
		this.container.empty()

		const state = getPropertyRowState(this.plugin, this.propertyName)

		// Mapping type selector
		const mappingTypeContainer = this.container.createDiv("graphdb-property-config-section")
		const mappingTypeRow = mappingTypeContainer.createDiv("graphdb-property-config-mapping-type-row")
		
		this.mappingTypeSelector = new MappingTypeSelector(
			mappingTypeRow,
			state.mappingType,
			(mappingType) => this.onMappingTypeChange(mappingType)
		)
		
		// Validation badge container (just right of mapping type select)
		const validationBadgeContainer = mappingTypeRow.createDiv("graphdb-validation-badge-container")
		
		// Enabled toggle (far right)
		this.enabledToggle = new EnabledToggle(
			mappingTypeRow,
			state.isEnabled,
			(enabled) => this.onEnabledToggleChange(enabled)
		)

		// Relationship-specific configuration
		if (state.mappingType === "relationship") {
			this.renderRelationshipConfig(state.relationship)
		} else if (state.mappingType !== "none") {
			// Node property configuration
			this.renderNodePropertyConfig(state.nodeProperty)
			// Clean up relationship config section if switching away
			if (this.relationshipConfigSection) {
				this.relationshipConfigSection = null
			}
		} else {
			// Clean up both config sections if switching to none
			if (this.relationshipConfigSection) {
				this.relationshipConfigSection = null
			}
			if (this.nodePropertyConfigSection) {
				this.nodePropertyConfigSection = null
			}
		}

		return validationBadgeContainer
	}


	/**
	 * Renders relationship configuration section
	 */
	private renderRelationshipConfig(mapping: RelationshipMapping | null): void {
		// Create container for relationship config
		const relationshipContainer = this.container.createDiv("graphdb-property-config-section")
		
		// Create and render relationship config section
		this.relationshipConfigSection = new RelationshipConfigSection(
			relationshipContainer,
			this.plugin,
			this.propertyName,
			{
				onUpdate: () => {
					// Update diagram when relationship config changes
					this.onUpdateDiagram()
				},
			}
		)
		this.relationshipConfigSection.render(mapping)
	}

	/**
	 * Renders node property configuration section
	 */
	private renderNodePropertyConfig(mapping: NodePropertyMapping | null): void {
		// Create container for node property config
		const nodePropertyContainer = this.container.createDiv("graphdb-property-config-section")
		
		// Create and render node property config section
		this.nodePropertyConfigSection = new NodePropertyConfigSection(
			nodePropertyContainer,
			this.plugin,
			this.propertyName,
			{
				onUpdate: () => {
					// Update display when node property config changes
					this.onUpdateNodePropertyDisplay()
				},
			}
		)
		this.nodePropertyConfigSection.render(mapping)
	}

	/**
	 * Gets the relationship config section (for diagram updates)
	 */
	getRelationshipConfigSection(): RelationshipConfigSection | null {
		return this.relationshipConfigSection
	}
}

