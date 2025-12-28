import type GraphDBSyncPlugin from "../main"
import type {
	PluginSettings,
	RelationshipMapping,
	NodePropertyMapping,
	LabelRule,
} from "../types"

/**
 * Service for managing all configuration types
 * Centralizes CRUD operations for relationships, node properties, and label rules
 */
export class ConfigurationService {
	/**
	 * RELATIONSHIP MAPPINGS
	 */

	static getRelationshipMappings(settings: PluginSettings): RelationshipMapping[] {
		const mappings: RelationshipMapping[] = []
		const propertyMappings = settings.propertyMappings || {}

		for (const [propertyName, mapping] of Object.entries(propertyMappings)) {
			if (mapping.mappingType === "relationship" && mapping.config && "relationshipType" in mapping.config) {
				const config = mapping.config as { relationshipType: string; direction?: "outgoing" | "incoming" }
				mappings.push({
					propertyName,
					relationshipType: config.relationshipType,
					direction: config.direction || "outgoing",
					enabled: mapping.enabled || false,
				})
			}
		}

		return mappings
	}

	static getRelationshipMapping(settings: PluginSettings, propertyName: string): RelationshipMapping | null {
		const mapping = settings.propertyMappings?.[propertyName]
		if (mapping?.mappingType === "relationship" && mapping.config && "relationshipType" in mapping.config) {
			const config = mapping.config as { relationshipType: string; direction?: "outgoing" | "incoming" }
			return {
				propertyName,
				relationshipType: config.relationshipType,
				direction: config.direction || "outgoing",
				enabled: mapping.enabled || false,
			}
		}
		return null
	}

	static async saveRelationshipMapping(
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		mapping: RelationshipMapping
	): Promise<void> {
		if (!plugin.settings.propertyMappings) {
			plugin.settings.propertyMappings = {}
		}

		plugin.settings.propertyMappings[propertyName] = {
			propertyName,
			mappingType: "relationship",
			config: {
				relationshipType: mapping.relationshipType,
				direction: mapping.direction,
			},
			enabled: mapping.enabled,
		}

		await plugin.saveSettings()
	}

	static async deleteRelationshipMapping(plugin: GraphDBSyncPlugin, propertyName: string): Promise<void> {
		if (plugin.settings.propertyMappings?.[propertyName]) {
			delete plugin.settings.propertyMappings[propertyName]
			await plugin.saveSettings()
		}
	}

	/**
	 * Gets all enabled relationship mappings (for MigrationService)
	 */
	static getEnabledRelationshipMappings(settings: PluginSettings): RelationshipMapping[] {
		return this.getRelationshipMappings(settings).filter(m => m.enabled)
	}

	/**
	 * NODE PROPERTY MAPPINGS
	 */

	static getNodePropertyMappings(settings: PluginSettings): NodePropertyMapping[] {
		const mappings: NodePropertyMapping[] = []
		const propertyMappings = settings.propertyMappings || {}

		for (const [propertyName, mapping] of Object.entries(propertyMappings)) {
			if (mapping.mappingType === "node_property" && mapping.config && "nodePropertyType" in mapping.config) {
				const config = mapping.config as { nodePropertyType: string; nodePropertyName?: string }
				mappings.push({
					propertyName,
					nodePropertyType: config.nodePropertyType as "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string",
					nodePropertyName: config.nodePropertyName || propertyName,
					enabled: mapping.enabled || false,
				})
			}
		}

		return mappings
	}

	static getNodePropertyMapping(settings: PluginSettings, propertyName: string): NodePropertyMapping | null {
		const mapping = settings.propertyMappings?.[propertyName]
		if (mapping?.mappingType === "node_property" && mapping.config && "nodePropertyType" in mapping.config) {
			const config = mapping.config as { nodePropertyType: string; nodePropertyName?: string }
			return {
				propertyName,
				nodePropertyType: config.nodePropertyType as "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string",
				nodePropertyName: config.nodePropertyName || propertyName,
				enabled: mapping.enabled || false,
			}
		}
		return null
	}

	static async saveNodePropertyMapping(
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		mapping: NodePropertyMapping
	): Promise<void> {
		if (!plugin.settings.propertyMappings) {
			plugin.settings.propertyMappings = {}
		}

		plugin.settings.propertyMappings[propertyName] = {
			propertyName,
			mappingType: "node_property",
			config: {
				nodePropertyType: mapping.nodePropertyType,
				nodePropertyName: mapping.nodePropertyName,
			},
			enabled: mapping.enabled,
		}

		await plugin.saveSettings()
	}

	static async deleteNodePropertyMapping(plugin: GraphDBSyncPlugin, propertyName: string): Promise<void> {
		if (plugin.settings.propertyMappings?.[propertyName]) {
			delete plugin.settings.propertyMappings[propertyName]
			await plugin.saveSettings()
		}
	}

	/**
	 * LABEL RULES
	 */

	static getLabelRules(settings: PluginSettings): LabelRule[] {
		return settings.labelRules || []
	}

	static async saveLabelRule(plugin: GraphDBSyncPlugin, rule: LabelRule): Promise<void> {
		if (!plugin.settings.labelRules) {
			plugin.settings.labelRules = []
		}

		// Update existing or add new
		const index = plugin.settings.labelRules.findIndex(
			(r) => r.type === rule.type && r.pattern === rule.pattern
		)

		if (index >= 0) {
			plugin.settings.labelRules[index] = rule
		} else {
			plugin.settings.labelRules.push(rule)
		}

		await plugin.saveSettings()
	}

	static async deleteLabelRule(plugin: GraphDBSyncPlugin, rule: LabelRule): Promise<void> {
		if (!plugin.settings.labelRules) {
			return
		}

		plugin.settings.labelRules = plugin.settings.labelRules.filter(
			(r) => !(r.type === rule.type && r.pattern === rule.pattern)
		)

		await plugin.saveSettings()
	}
}

