import type GraphDBSyncPlugin from "../main"
import { ConfigurationService } from "../services/ConfigurationService"
import { PropertyRow } from "./PropertyRow"
import type { PropertyInfo, PropertyType } from "../types"

/**
 * Node property mappings tab
 * Shows only properties with node property mappings configured (excluding relationship mappings)
 */
export class NodePropertyMappingsTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private propertiesContainer: HTMLElement | null = null
	private propertyRows: PropertyRow[] = []
	private allProperties: PropertyInfo[] = []
	private onConfigure: (property: PropertyInfo) => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.onConfigure = callbacks.onConfigure
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-node-properties-tab")

		// Header
		const header = this.container.createDiv("graphdb-tab-header")
		header.createEl("h2", {
			text: "Node Property Mappings",
		})

		// Properties container
		this.propertiesContainer = this.container.createDiv("graphdb-tab-properties")

		// Load properties
		this.loadProperties()
	}

	private loadProperties(): void {
		if (!this.propertiesContainer) return

		// Get properties from metadataTypeManager
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const metadataTypeManager = (this.plugin.app as any).metadataTypeManager
		if (!metadataTypeManager) {
			this.propertiesContainer.createDiv({
				text: "Metadata type manager not available.",
				cls: "graphdb-tab-error",
			})
			return
		}

		const propertyTypes = metadataTypeManager.properties
		const allPropertyNames = Object.keys(propertyTypes)

		// Convert to PropertyInfo
		this.allProperties = allPropertyNames.map((name) => {
			const typeData = propertyTypes[name]
			const widget = typeData?.widget || "text"
			return {
				name,
				type: widget as PropertyType,
				occurrences: typeData?.occurrences,
			}
		})

		// Get node property mappings (excluding relationship mappings)
		const nodePropertyMappings = ConfigurationService.getNodePropertyMappings(this.plugin.settings)
		const relationshipMappings = ConfigurationService.getRelationshipMappings(this.plugin.settings)
		const relationshipPropertyNames = new Set(relationshipMappings.map((m) => m.propertyName))
		
		// Filter to only show properties with node property mappings that are NOT relationship mappings
		const mappedPropertyNames = new Set(
			nodePropertyMappings
				.filter((m) => !relationshipPropertyNames.has(m.propertyName))
				.map((m) => m.propertyName)
		)

		const filtered = this.allProperties.filter((prop) => mappedPropertyNames.has(prop.name))

		// Clear existing rows
		this.propertyRows.forEach((row) => row.destroy())
		this.propertyRows = []
		this.propertiesContainer.empty()

		if (filtered.length === 0) {
			this.propertiesContainer.createDiv({
				text: "No node property mappings configured. Configure a property in the All Properties tab.",
				cls: "graphdb-tab-empty",
			})
			return
		}

		// Create rows
		filtered.forEach((property) => {
			const row = new PropertyRow(
				this.propertiesContainer!,
				this.plugin,
				property,
				{
					onConfigure: this.onConfigure,
				}
			)
			this.propertyRows.push(row)
		})
	}

	/**
	 * Refreshes the tab
	 */
	refresh(): void {
		this.loadProperties()
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.propertyRows.forEach((row) => row.destroy())
		this.propertyRows = []
	}
}
