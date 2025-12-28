import type GraphDBSyncPlugin from "../main"
import { PropertyRow } from "./PropertyRow"
import type { PropertyInfo, ObsidianPropertyType } from "../types"
import { getPropertyRowState } from "./PropertyRow/utils/PropertyRowState"

/**
 * Properties tab
 * Shows all properties from metadataTypeManager
 */
export class PropertiesTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private propertiesContainer: HTMLElement | null = null
	private propertyRows: PropertyRow[] = []
	private allProperties: PropertyInfo[] = []
	private searchInput: HTMLInputElement | null = null
	private typeFilterSelect: HTMLSelectElement | null = null
	private mappingTypeFilterSelect: HTMLSelectElement | null = null
	private sortSelect: HTMLSelectElement | null = null
	private sortBy: "alphabetical" | "occurrences" = "alphabetical"
	private sortDirection: "asc" | "desc" = "asc"

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin
	) {
		this.container = container
		this.plugin = plugin
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-properties-tab")

		// Header
		const header = this.container.createDiv("graphdb-tab-header")
		header.createEl("h2", {
			text: "All Properties",
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
			this.filterAndSortProperties()
		})

		// Type filter (frontmatter property type)
		const typeFilterContainer = controls.createDiv("graphdb-tab-filter")
		typeFilterContainer.createSpan({ text: "Type: " })
		this.typeFilterSelect = typeFilterContainer.createEl("select", {
			cls: "graphdb-tab-filter-select",
		})
		this.typeFilterSelect.createEl("option", { text: "All", value: "all" })
		this.typeFilterSelect.addEventListener("change", () => {
			this.filterAndSortProperties()
		})

		// Mapping type filter
		const mappingTypeFilterContainer = controls.createDiv("graphdb-tab-filter")
		mappingTypeFilterContainer.createSpan({ text: "Mapping: " })
		this.mappingTypeFilterSelect = mappingTypeFilterContainer.createEl("select", {
			cls: "graphdb-tab-filter-select",
		})
		this.mappingTypeFilterSelect.createEl("option", { text: "All", value: "all" })
		this.mappingTypeFilterSelect.createEl("option", { text: "None", value: "none" })
		this.mappingTypeFilterSelect.createEl("option", { text: "Relationship", value: "relationship" })
		this.mappingTypeFilterSelect.createEl("option", { text: "Boolean", value: "boolean" })
		this.mappingTypeFilterSelect.createEl("option", { text: "Integer", value: "integer" })
		this.mappingTypeFilterSelect.createEl("option", { text: "Float", value: "float" })
		this.mappingTypeFilterSelect.createEl("option", { text: "Date", value: "date" })
		this.mappingTypeFilterSelect.createEl("option", { text: "DateTime", value: "datetime" })
		this.mappingTypeFilterSelect.createEl("option", { text: "String", value: "string" })
		this.mappingTypeFilterSelect.createEl("option", { text: "List (String)", value: "list_string" })
		this.mappingTypeFilterSelect.addEventListener("change", () => {
			this.filterAndSortProperties()
		})

		// Sort select
		const sortContainer = controls.createDiv("graphdb-tab-filter")
		sortContainer.createSpan({ text: "Sort: " })
		this.sortSelect = sortContainer.createEl("select", {
			cls: "graphdb-tab-filter-select",
		})
		this.sortSelect.createEl("option", { text: "A-Z", value: "alphabetical-asc" })
		this.sortSelect.createEl("option", { text: "Z-A", value: "alphabetical-desc" })
		this.sortSelect.createEl("option", { text: "Occurrences (High to Low)", value: "occurrences-desc" })
		this.sortSelect.createEl("option", { text: "Occurrences (Low to High)", value: "occurrences-asc" })
		this.sortSelect.value = "alphabetical-asc"
		this.sortSelect.addEventListener("change", () => {
			const [sortType, direction] = this.sortSelect!.value.split("-")
			this.sortBy = sortType as "alphabetical" | "occurrences"
			this.sortDirection = direction as "asc" | "desc"
			this.filterAndSortProperties()
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
				type: widget as ObsidianPropertyType,
				occurrences: typeData?.occurrences,
			}
		})

		// Populate type filter options
		this.populateTypeFilter()

		// Set initial sort state
		if (this.sortSelect) {
			this.sortSelect.value = "alphabetical-asc"
			this.sortBy = "alphabetical"
			this.sortDirection = "asc"
		}

		// Filter and sort
		this.filterAndSortProperties()
	}

	private populateTypeFilter(): void {
		if (!this.typeFilterSelect) return

		// Get distinct types
		const types = new Set(this.allProperties.map((p) => p.type))
		const sortedTypes = Array.from(types).sort()

		// Clear existing options (except "All")
		const allOption = this.typeFilterSelect.querySelector('option[value="all"]')
		this.typeFilterSelect.empty()
		if (allOption) {
			this.typeFilterSelect.appendChild(allOption)
		}

		// Add type options
		sortedTypes.forEach((type) => {
			this.typeFilterSelect!.createEl("option", { text: type, value: type })
		})
	}

	private filterAndSortProperties(): void {
		if (!this.propertiesContainer) return

		const searchTerm = this.searchInput?.value.toLowerCase() || ""
		const typeFilter = this.typeFilterSelect?.value || "all"
		const mappingTypeFilter = this.mappingTypeFilterSelect?.value || "all"

		// Filter
		const filtered = this.allProperties.filter((prop) => {
			// Search filter
			if (searchTerm && !prop.name.toLowerCase().includes(searchTerm)) {
				return false
			}
			// Frontmatter type filter
			if (typeFilter !== "all" && prop.type !== typeFilter) {
				return false
			}
			// Mapping type filter
			if (mappingTypeFilter !== "all") {
				const state = getPropertyRowState(this.plugin, prop.name)
				if (state.mappingType !== mappingTypeFilter) {
					return false
				}
			}
			return true
		})

		// Sort
		const sorted = [...filtered]
		if (this.sortBy === "alphabetical") {
			sorted.sort((a, b) => {
				const comparison = a.name.localeCompare(b.name)
				return this.sortDirection === "asc" ? comparison : -comparison
			})
		} else if (this.sortBy === "occurrences") {
			sorted.sort((a, b) => {
				const aOcc = a.occurrences ?? 0
				const bOcc = b.occurrences ?? 0
				return this.sortDirection === "desc" ? bOcc - aOcc : aOcc - bOcc
			})
		}

		// Clear existing rows
		this.propertyRows.forEach((row) => row.destroy())
		this.propertyRows = []
		this.propertiesContainer.empty()

		if (sorted.length === 0) {
			this.propertiesContainer.createDiv({
				text: searchTerm || typeFilter !== "all" || mappingTypeFilter !== "all"
					? "No properties match your filters."
					: "No properties found.",
				cls: "graphdb-tab-empty",
			})
			return
		}

		// Create rows
		sorted.forEach((property) => {
			const row = new PropertyRow(
				this.propertiesContainer!,
				this.plugin,
				property
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

