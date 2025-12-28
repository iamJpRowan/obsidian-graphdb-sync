import type GraphDBSyncPlugin from "../../../main"
import { ConfigurationService } from "../../../services/ConfigurationService"

/**
 * Mapping type handler component
 * Handles mapping type changes and related cleanup/creation logic
 */
export class MappingTypeHandler {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private onCleanupDisplays: () => void
	private onRenderConfiguration: () => void
	private onRenderRelationshipDiagram: (mapping: import("../../../types").RelationshipMapping | null) => void
	private onRenderNodePropertyName: (mapping: import("../../../types").NodePropertyMapping | null) => void
	private onUpdateRowEnabledState: () => void

	constructor(
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		callbacks: {
			onCleanupDisplays: () => void
			onRenderConfiguration: () => void
			onRenderRelationshipDiagram: (mapping: import("../../../types").RelationshipMapping | null) => void
			onRenderNodePropertyName: (mapping: import("../../../types").NodePropertyMapping | null) => void
			onUpdateRowEnabledState: () => void
		}
	) {
		this.plugin = plugin
		this.propertyName = propertyName
		this.onCleanupDisplays = callbacks.onCleanupDisplays
		this.onRenderConfiguration = callbacks.onRenderConfiguration
		this.onRenderNodePropertyName = callbacks.onRenderNodePropertyName
		this.onRenderRelationshipDiagram = callbacks.onRenderRelationshipDiagram
		this.onUpdateRowEnabledState = callbacks.onUpdateRowEnabledState
	}

	/**
	 * Handles mapping type change
	 */
	handleChange(mappingType: string): void {
		// Remove diagram/display if switching away from relationship or node property
		if (mappingType === "none") {
			this.onCleanupDisplays()
		}

		// Create or delete mapping based on type
		if (mappingType === "none") {
			// Delete mapping
			ConfigurationService.deleteRelationshipMapping(this.plugin, this.propertyName)
			ConfigurationService.deleteNodePropertyMapping(this.plugin, this.propertyName)
		} else if (mappingType === "relationship") {
			// Create relationship mapping with defaults
			ConfigurationService.saveRelationshipMapping(this.plugin, this.propertyName, {
				propertyName: this.propertyName,
				relationshipType: "",
				direction: "outgoing",
				enabled: true,
			})
		} else {
			// Create node property mapping with the selected type
			const nodePropertyType = mappingType as "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
			ConfigurationService.saveNodePropertyMapping(this.plugin, this.propertyName, {
				propertyName: this.propertyName,
				nodePropertyType,
				nodePropertyName: this.propertyName,
				enabled: true,
			})
		}

		// Re-render configuration
		this.onRenderConfiguration()
		
		// Update diagram/display based on mapping type
		if (mappingType === "relationship") {
			const currentMapping = ConfigurationService.getRelationshipMapping(
				this.plugin.settings,
				this.propertyName
			)
			this.onRenderRelationshipDiagram(currentMapping)
		} else if (mappingType !== "none") {
			const nodePropertyMapping = ConfigurationService.getNodePropertyMapping(
				this.plugin.settings,
				this.propertyName
			)
			this.onRenderNodePropertyName(nodePropertyMapping)
		}
		
		// Update row enabled state
		this.onUpdateRowEnabledState()
	}
}

