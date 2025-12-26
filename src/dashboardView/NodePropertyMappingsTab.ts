import { Notice } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { PropertyDiscoveryService } from "../services/PropertyDiscoveryService"
import { ConfigurationService } from "../services/ConfigurationService"
import { PropertyRow } from "./PropertyRow"
import type { PropertyInfo } from "../types"

/**
 * Node property mappings tab
 * Shows all properties with ability to configure node property mappings
 */
export class NodePropertyMappingsTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private searchInput: HTMLInputElement | null = null
	private enabledFilterSelect: HTMLSelectElement | null = null
	private propertiesContainer: HTMLElement | null = null
	private propertyRows: PropertyRow[] = []
	private allProperties: PropertyInfo[] = []
	private onConfigure: (property: PropertyInfo) => void
	private onValidate: (property: PropertyInfo) => void
	private onMigrate: (property: PropertyInfo) => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
			onValidate: (property: PropertyInfo) => void
			onMigrate: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.onConfigure = callbacks.onConfigure
		this.onValidate = callbacks.onValidate
		this.onMigrate = callbacks.onMigrate
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

		// Controls
		const controls = this.container.createDiv("graphdb-tab-controls")
		
		// Search input
		const searchContainer = controls.createDiv("graphdb-tab-search")
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search properties...",
			cls: "graphdb-tab-search-input",
		})
		this.searchInput.addEventListener("input", () => {
			this.filterProperties()
		})

		// Enabled filter
		const filterContainer = controls.createDiv("graphdb-tab-filter")
		filterContainer.createSpan({ text: "Status: " })
		this.enabledFilterSelect = filterContainer.createEl("select", {
			cls: "graphdb-tab-filter-select",
		})
		this.enabledFilterSelect.createEl("option", { text: "All", value: "all" })
		this.enabledFilterSelect.createEl("option", { text: "Enabled", value: "enabled" })
		this.enabledFilterSelect.createEl("option", { text: "Disabled", value: "disabled" })
		this.enabledFilterSelect.addEventListener("change", () => {
			this.filterProperties()
		})

		// Refresh button
		const refreshBtn = controls.createEl("button", {
			text: "Refresh Properties",
			cls: "mod-cta",
		})
		refreshBtn.addEventListener("click", () => {
			this.loadProperties(true)
		})

		// Properties container
		this.propertiesContainer = this.container.createDiv("graphdb-tab-properties")

		// Load properties
		this.loadProperties()
	}

	private async loadProperties(forceRefresh: boolean = false): Promise<void> {
		if (!this.propertiesContainer) return

		// Show loading
		this.propertiesContainer.empty()
		this.propertiesContainer.createDiv({
			text: "Loading properties...",
			cls: "graphdb-tab-loading",
		})

		try {
			// Discover properties
			this.allProperties = await PropertyDiscoveryService.discoverProperties(
				this.plugin.app,
				forceRefresh
			)

			// Filter and display
			this.filterProperties()
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			this.propertiesContainer.empty()
			this.propertiesContainer.createDiv({
				text: `Error loading properties: ${errorMessage}`,
				cls: "graphdb-tab-error",
			})
			new Notice(`Failed to load properties: ${errorMessage}`)
		}
	}

	private filterProperties(): void {
		if (!this.propertiesContainer) return

		const searchTerm = this.searchInput?.value.toLowerCase() || ""
		const enabledFilter = this.enabledFilterSelect?.value || "all"
		
		// Apply search filter
		let filtered = this.allProperties
		if (searchTerm) {
			filtered = filtered.filter((prop) =>
				prop.name.toLowerCase().includes(searchTerm)
			)
		}
		
		// Apply enabled/disabled filter
		if (enabledFilter !== "all") {
			filtered = filtered.filter((prop) => {
				const mapping = ConfigurationService.getNodePropertyMapping(this.plugin.settings, prop.name)
				if (!mapping) return enabledFilter === "disabled" // Unmapped = disabled
				return enabledFilter === "enabled" ? mapping.enabled : !mapping.enabled
			})
		}

		// Clear existing rows
		this.propertyRows.forEach((row) => row.destroy())
		this.propertyRows = []
		this.propertiesContainer.empty()

		if (filtered.length === 0) {
			this.propertiesContainer.createDiv({
				text: searchTerm
					? "No properties match your search."
					: "No properties found. Click 'Refresh Properties' to scan your vault.",
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
					onValidate: this.onValidate,
					onMigrate: this.onMigrate,
				}
			)
			this.propertyRows.push(row)
		})
	}

	/**
	 * Refreshes the tab (reloads properties)
	 */
	refresh(): void {
		this.loadProperties(true)
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.propertyRows.forEach((row) => row.destroy())
		this.propertyRows = []
	}
}

