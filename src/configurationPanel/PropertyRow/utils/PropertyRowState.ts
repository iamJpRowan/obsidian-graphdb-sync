import type GraphDBSyncPlugin from "../../../main"
import type { RelationshipMapping, NodePropertyMapping } from "../../../types"
import { ConfigurationService } from "../../../services/ConfigurationService"

export type MappingType = "none" | "relationship" | "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"

export interface PropertyRowState {
	relationship: RelationshipMapping | null
	nodeProperty: NodePropertyMapping | null
	mappingType: MappingType
	isEnabled: boolean
}

/**
 * Helper to get current property row state
 * Centralizes the pattern of retrieving mappings and determining state
 */
export function getPropertyRowState(
	plugin: GraphDBSyncPlugin,
	propertyName: string
): PropertyRowState {
	const relationship = ConfigurationService.getRelationshipMapping(
		plugin.settings,
		propertyName
	)
	const nodeProperty = ConfigurationService.getNodePropertyMapping(
		plugin.settings,
		propertyName
	)

	// Determine current mapping type
	let mappingType: MappingType = "none"
	if (relationship) {
		mappingType = "relationship"
	} else if (nodeProperty) {
		mappingType = nodeProperty.nodePropertyType
	}

	const isEnabled = relationship?.enabled || nodeProperty?.enabled || false

	return {
		relationship,
		nodeProperty,
		mappingType,
		isEnabled,
	}
}

