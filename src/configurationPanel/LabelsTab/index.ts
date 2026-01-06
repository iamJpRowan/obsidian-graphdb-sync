import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { LabelRow } from "./components/LabelRow"
import type { LabelRule } from "../../types"
import { ConfigurationService } from "../../services/ConfigurationService"
import "./styles.css"

/**
 * Labels tab
 * Shows all label rules and allows adding/deleting them
 */
export class LabelsTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private labelsContainer: HTMLElement | null = null
	private labelRows: LabelRow[] = []
	private addButton: HTMLElement | null = null
	private searchInput: HTMLInputElement | null = null
	private typeFilterSelect: HTMLSelectElement | null = null
	private sortDirectionIcon: HTMLElement | null = null
	private sortDirection: "asc" | "desc" = "asc"
	private allRules: LabelRule[] = []
	private newRuleIds: Set<string> = new Set() // Track newly created rules that haven't been saved yet

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
		this.container.addClass("graphdb-labels-tab")

		// Controls
		const controls = this.container.createDiv("graphdb-tab-controls")

		// Search input
		const searchContainer = controls.createDiv("graphdb-tab-search")
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search label rules...",
			cls: "graphdb-tab-search-input",
		})
		this.searchInput.addEventListener("input", () => {
			this.filterAndSortLabelRules()
		})

		// Type filter (tag or folder)
		const typeFilterContainer = controls.createDiv("graphdb-tab-filter")
		typeFilterContainer.createSpan({ text: "Type: " })
		this.typeFilterSelect = typeFilterContainer.createEl("select", {
			cls: "graphdb-tab-filter-select",
		})
		this.typeFilterSelect.createEl("option", { text: "All", value: "all" })
		this.typeFilterSelect.createEl("option", { text: "Tag", value: "tag" })
		this.typeFilterSelect.createEl("option", {
			text: "Folder",
			value: "path",
		})
		this.typeFilterSelect.addEventListener("change", () => {
			this.filterAndSortLabelRules()
		})

		// Sort direction toggle icon
		const sortDirectionContainer = controls.createDiv(
			"graphdb-sort-direction-container"
		)
		this.sortDirectionIcon = sortDirectionContainer.createSpan(
			"graphdb-sort-direction-icon"
		)
		sortDirectionContainer.setAttr("title", "Toggle sort direction (alphabetical)")
		sortDirectionContainer.setAttr("aria-label", "Toggle sort direction")
		this.updateSortDirectionIcon()
		sortDirectionContainer.addEventListener("click", (e) => {
			e.stopPropagation()
			this.sortDirection =
				this.sortDirection === "asc" ? "desc" : "asc"
			this.updateSortDirectionIcon()
			this.filterAndSortLabelRules()
		})

		// Add label rule button (clickable icon pattern - matching SyncIcon)
		const addButtonContainer = controls.createDiv("graphdb-sync-icon-container")
		addButtonContainer.setAttr("role", "button")
		addButtonContainer.setAttr("tabindex", "0")
		addButtonContainer.setAttr("aria-label", "Add label rule")
		this.addButton = addButtonContainer.createSpan("graphdb-sync-icon")
		setIcon(this.addButton, "plus")
		const addButtonText = addButtonContainer.createSpan("graphdb-sync-icon-text")
		addButtonText.setText("Add label rule")
		addButtonContainer.addEventListener("click", () => {
			this.handleAddLabelRule()
		})
		addButtonContainer.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				this.handleAddLabelRule()
			}
		})

		// Labels container
		this.labelsContainer = this.container.createDiv("graphdb-tab-labels")

		// Load label rules
		this.loadLabelRules()
	}

	private loadLabelRules(): void {
		if (!this.labelsContainer) return

		// Load all rules
		this.allRules = ConfigurationService.getLabelRules(this.plugin.settings)

		// Filter and sort
		this.filterAndSortLabelRules()
	}

	private filterAndSortLabelRules(): void {
		if (!this.labelsContainer) return

		const searchTerm = this.searchInput?.value.toLowerCase() || ""
		const typeFilter = this.typeFilterSelect?.value || "all"

		// Filter
		const filtered = this.allRules.filter((rule) => {
			// Search filter (by label name)
			if (
				searchTerm &&
				!rule.labelName.toLowerCase().includes(searchTerm)
			) {
				return false
			}
			// Type filter
			if (typeFilter !== "all" && rule.type !== typeFilter) {
				return false
			}
			return true
		})

		// Separate new rules (at top) from existing rules (sorted)
		const newRules = filtered.filter((rule) =>
			this.newRuleIds.has(rule.id)
		)
		const existingRules = filtered.filter(
			(rule) => !this.newRuleIds.has(rule.id)
		)

		// Sort existing rules alphabetically by label name
		const sortedExisting = [...existingRules].sort((a, b) => {
			const comparison = a.labelName.localeCompare(b.labelName)
			return this.sortDirection === "asc" ? comparison : -comparison
		})

		// Combine: new rules first, then sorted existing rules
		const sorted = [...newRules, ...sortedExisting]

		// Clear existing rows
		this.labelRows.forEach((row) => row.destroy())
		this.labelRows = []
		this.labelsContainer.empty()

		if (sorted.length === 0) {
			this.labelsContainer.createDiv({
				text:
					searchTerm || typeFilter !== "all"
						? "No label rules match your filters."
						: "No label rules configured. Click 'Add label rule' to create one.",
				cls: "graphdb-tab-empty",
			})
			return
		}

		// Create rows
		sorted.forEach((rule) => {
			const row = new LabelRow(
				this.labelsContainer!,
				this.plugin,
				rule,
				() => this.handleDeleteLabelRule(rule.id),
				() => this.handleRuleSaved(rule.id) // Callback when rule is saved
			)
			this.labelRows.push(row)
		})
	}

	/**
	 * Updates the sort direction icon based on current direction
	 */
	private updateSortDirectionIcon(): void {
		if (!this.sortDirectionIcon) return

		const iconName =
			this.sortDirection === "asc"
				? "arrow-down-wide-narrow"
				: "arrow-up-wide-narrow"
		setIcon(this.sortDirectionIcon, iconName)
	}

	private async handleAddLabelRule(): Promise<void> {
		// Create a new label rule with default values
		const newRule: LabelRule = {
			id: `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			labelName: `Label_${Date.now()}`,
			type: "tag",
			pattern: "",
		}

		await ConfigurationService.saveLabelRule(this.plugin, newRule)
		// Mark as new rule (will appear at top until saved)
		this.newRuleIds.add(newRule.id)
		// Reload all rules and re-filter/sort
		this.loadLabelRules()
	}

	private async handleDeleteLabelRule(id: string): Promise<void> {
		await ConfigurationService.deleteLabelRule(this.plugin, id)
		// Remove from new rules set if present
		this.newRuleIds.delete(id)
		// Reload all rules and re-filter/sort
		this.loadLabelRules()
	}

	/**
	 * Called when a rule is saved (after editing)
	 * Removes it from new rules set so it sorts normally
	 * Preserves expanded state of other rows when re-sorting
	 */
	private handleRuleSaved(id: string): void {
		this.newRuleIds.delete(id)
		
		// Track which rows are currently expanded (excluding the one that was just saved)
		const expandedRowIds = new Set<string>()
		this.labelRows.forEach((row) => {
			const rowId = row.getId()
			if (rowId !== id && row.isExpanded()) {
				expandedRowIds.add(rowId)
			}
		})

		// Re-sort (this will destroy and recreate all rows)
		this.filterAndSortLabelRules()

		// Re-expand rows that were previously expanded
		expandedRowIds.forEach((rowId) => {
			const row = this.labelRows.find((r) => r.getId() === rowId)
			if (row) {
				row.expand()
			}
		})
	}

	/**
	 * Refreshes the tab
	 */
	refresh(): void {
		this.loadLabelRules()
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.labelRows.forEach((row) => row.destroy())
		this.labelRows = []
	}
}

