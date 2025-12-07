import type {
	PluginSettings,
	PropertyMapping,
	RelationshipMappingConfig,
} from "../types"

/**
 * Gets the property mapping configuration for a property
 * @param settings - Plugin settings
 * @param propertyName - Name of the property
 * @returns Property mapping configuration or undefined if not configured
 */
export function getPropertyMapping(
	settings: PluginSettings,
	propertyName: string
): PropertyMapping | undefined {
	return settings.propertyMappings?.[propertyName]
}

/**
 * Checks if a property has an enabled relationship mapping
 * @param settings - Plugin settings
 * @param propertyName - Name of the property
 * @returns True if property has enabled relationship mapping
 */
export function hasEnabledRelationship(
	settings: PluginSettings,
	propertyName: string
): boolean {
	const mapping = getPropertyMapping(settings, propertyName)
	return (
		mapping?.mappingType === "relationship" && mapping.enabled === true
	)
}

/**
 * Gets the relationship configuration for a property if enabled
 * @param settings - Plugin settings
 * @param propertyName - Name of the property
 * @returns Relationship configuration or null if not enabled/configured
 */
export function getRelationshipConfig(
	settings: PluginSettings,
	propertyName: string
): RelationshipMappingConfig | null {
	const mapping = getPropertyMapping(settings, propertyName)
	if (
		mapping?.mappingType === "relationship" &&
		mapping.enabled &&
		"relationshipType" in mapping.config
	) {
		return mapping.config as RelationshipMappingConfig
	}
	return null
}

