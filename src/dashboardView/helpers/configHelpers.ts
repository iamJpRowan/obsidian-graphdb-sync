import type { RelationshipMappingConfig, NodePropertyMappingConfig } from "../../types"

/**
 * Creates a fresh relationship mapping configuration with default values
 */
export function createRelationshipConfig(): RelationshipMappingConfig {
	return {
		relationshipType: "",
		direction: "outgoing",
	}
}

/**
 * Creates a fresh node property mapping configuration (placeholder for future implementation)
 * Note: Using `any` type as this is a placeholder until node property feature is fully implemented
 */
export function createNodePropertyConfig(): NodePropertyMappingConfig {
	// TODO: Replace with proper NodePropertyMappingConfig when feature is implemented
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return {} as any
}

/**
 * Creates a fresh config for the given mapping type
 */
export function createConfigForMappingType(
	mappingType: "relationship" | "node_property"
): RelationshipMappingConfig | NodePropertyMappingConfig {
	if (mappingType === "relationship") {
		return createRelationshipConfig()
	} else {
		return createNodePropertyConfig()
	}
}

