import { Modal, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import type { SyncHistoryEntry, PropertySyncHistoryEntry, RelationshipSyncHistoryEntry } from "../../types"

/**
 * Modal for displaying sync history and detailed results
 */
export class MigrationHistoryModal extends Modal {
	private plugin: GraphDBSyncPlugin

	constructor(plugin: GraphDBSyncPlugin) {
		super(plugin.app)
		this.plugin = plugin
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-migration-history-modal")

		// Header
		const header = contentEl.createDiv("graphdb-migration-history-header")
		const titleContainer = header.createDiv("graphdb-migration-history-title-container")
		const titleIcon = titleContainer.createSpan("graphdb-migration-history-title-icon")
		setIcon(titleIcon, "history")
		titleContainer.createEl("h2", { text: "Sync history" })

		// History list
		const history = this.plugin.settings.syncHistory || []
		
		if (history.length === 0) {
			const emptyState = contentEl.createDiv("graphdb-migration-history-empty")
			emptyState.setText("No sync history available")
			return
		}

		const listContainer = contentEl.createDiv("graphdb-migration-history-list")
		
		history.forEach((entry: SyncHistoryEntry) => {
			const entryEl = listContainer.createDiv("graphdb-migration-history-entry")
			entryEl.setAttr("data-entry-id", entry.id)
			
			// Entry header (clickable to expand details)
			const headerEl = entryEl.createDiv("graphdb-migration-history-entry-header")
			headerEl.setAttr("role", "button")
			headerEl.setAttr("tabindex", "0")
			
			// Status icon
			const statusIcon = headerEl.createSpan("graphdb-migration-history-status-icon")
			statusIcon.setText(entry.success ? "✓" : "✗")
			statusIcon.addClass(entry.success ? "success" : "error")
			
			// Summary with informative title
			const summary = headerEl.createDiv("graphdb-migration-history-summary")
			
			// Title showing sync type and properties
			const titleEl = summary.createSpan("graphdb-migration-history-date")
			titleEl.setText(this.getSyncTitle(entry))
			
			// Stats
			summary.createSpan("graphdb-migration-history-stats").setText(
				`${entry.successCount}/${entry.totalFiles} files • ${entry.errorCount} errors • ${this.formatDuration(entry.duration)}`
			)
			
			// Expand icon
			const expandIcon = headerEl.createSpan("graphdb-migration-history-expand")
			setIcon(expandIcon, "chevron-down")
			
			// Details section (initially hidden)
			const detailsEl = entryEl.createDiv("graphdb-migration-history-details")
			detailsEl.style.display = "none"
			this.renderEntryDetails(detailsEl, entry)
			
			// Toggle on click
			let isExpanded = false
			const toggleDetails = () => {
				isExpanded = !isExpanded
				detailsEl.style.display = isExpanded ? "block" : "none"
				setIcon(expandIcon, isExpanded ? "chevron-up" : "chevron-down")
				entryEl.toggleClass("expanded", isExpanded)
			}
			
			headerEl.addEventListener("click", toggleDetails)
			headerEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					toggleDetails()
				}
			})
		})
	}

	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
	}

	/**
	 * Gets informative title for sync entry
	 */
	private getSyncTitle(entry: SyncHistoryEntry): string {
		const date = new Date(entry.timestamp)
		const dateStr = date.toLocaleString()
		
		if (entry.type === "property-sync") {
			const propEntry = entry as PropertySyncHistoryEntry
			if (propEntry.properties && propEntry.properties.length > 0) {
				const propsStr = propEntry.properties.join(", ")
				return `Property sync: ${propsStr} • ${dateStr}`
			} else {
				return `Property sync: All properties • ${dateStr}`
			}
		} else if (entry.type === "relationship-sync") {
			const relEntry = entry as RelationshipSyncHistoryEntry
			if (relEntry.properties && relEntry.properties.length > 0) {
				const propsStr = relEntry.properties.join(", ")
				return `Relationship sync: ${propsStr} • ${dateStr}`
			} else {
				return `Relationship sync: All properties • ${dateStr}`
			}
		}
		
		return dateStr
	}

	/**
	 * Renders detailed information for a sync entry
	 */
	private renderEntryDetails(container: HTMLElement, entry: SyncHistoryEntry): void {
		if (entry.type === "property-sync") {
			this.renderPropertySyncDetails(container, entry as PropertySyncHistoryEntry)
		} else if (entry.type === "relationship-sync") {
			this.renderRelationshipSyncDetails(container, entry as RelationshipSyncHistoryEntry)
		}

		// Errors (common to both types)
		if (entry.errors && entry.errors.length > 0) {
			const errorsEl = container.createDiv("graphdb-migration-history-section")
			errorsEl.createEl("h4", { text: `Errors (${entry.errors.length})` })
			const errorsList = errorsEl.createDiv("graphdb-migration-history-errors-list")
			
			entry.errors.slice(0, 10).forEach(error => {
				const errorItem = errorsList.createDiv("graphdb-migration-history-error-item")
				if ("property" in error) {
					// Relationship error
					errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
					errorItem.createSpan("graphdb-migration-history-error-details").setText(
						`${error.property} → ${error.target}: ${error.error}`
					)
				} else {
					// Node error
					errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
					errorItem.createSpan("graphdb-migration-history-error-details").setText(error.error)
				}
			})
			
			if (entry.errors.length > 10) {
				errorsList.createDiv("graphdb-migration-history-error-more").setText(
					`... and ${entry.errors.length - 10} more errors`
				)
			}
		}

		// Message
		if (entry.message) {
			const messageEl = container.createDiv("graphdb-migration-history-section")
			messageEl.createEl("h4", { text: "Message" })
			messageEl.createSpan().setText(entry.message)
		}
	}

	/**
	 * Renders details for property sync entry
	 */
	private renderPropertySyncDetails(container: HTMLElement, entry: PropertySyncHistoryEntry): void {
		// Properties synced
		if (entry.properties && entry.properties.length > 0) {
			const propsEl = container.createDiv("graphdb-migration-history-section")
			propsEl.createEl("h4", { text: "Properties synced" })
			propsEl.createSpan().setText(entry.properties.join(", "))
		} else {
			const propsEl = container.createDiv("graphdb-migration-history-section")
			propsEl.createEl("h4", { text: "Properties synced" })
			propsEl.createSpan().setText("All properties")
		}

		// Node errors (if available)
		if (entry.nodeErrors && entry.nodeErrors.length > 0) {
			const nodeErrorsEl = container.createDiv("graphdb-migration-history-section")
			nodeErrorsEl.createEl("h4", { text: `Node creation errors (${entry.nodeErrors.length})` })
			const nodeErrorsList = nodeErrorsEl.createDiv("graphdb-migration-history-errors-list")
			
			entry.nodeErrors.slice(0, 10).forEach(error => {
				const errorItem = nodeErrorsList.createDiv("graphdb-migration-history-error-item")
				errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
				errorItem.createSpan("graphdb-migration-history-error-details").setText(error.error)
			})
			
			if (entry.nodeErrors.length > 10) {
				nodeErrorsList.createDiv("graphdb-migration-history-error-more").setText(
					`... and ${entry.nodeErrors.length - 10} more errors`
				)
			}
		}
	}

	/**
	 * Renders details for relationship sync entry
	 */
	private renderRelationshipSyncDetails(container: HTMLElement, entry: RelationshipSyncHistoryEntry): void {
		// Properties synced
		if (entry.properties && entry.properties.length > 0) {
			const propsEl = container.createDiv("graphdb-migration-history-section")
			propsEl.createEl("h4", { text: "Properties synced" })
			propsEl.createSpan().setText(entry.properties.join(", "))
		} else {
			const propsEl = container.createDiv("graphdb-migration-history-section")
			propsEl.createEl("h4", { text: "Properties synced" })
			propsEl.createSpan().setText("All properties")
		}

		// Relationship stats
		if (entry.relationshipStats) {
			const relStatsEl = container.createDiv("graphdb-migration-history-section")
			relStatsEl.createEl("h4", { text: "Relationships" })
			relStatsEl.createSpan().setText(
				`${entry.relationshipStats.successCount} created, ${entry.relationshipStats.errorCount} errors`
			)
		}

		// Property stats
		if (entry.propertyStats && Object.keys(entry.propertyStats).length > 0) {
			const propStatsEl = container.createDiv("graphdb-migration-history-section")
			propStatsEl.createEl("h4", { text: "Property statistics" })
			const propList = propStatsEl.createDiv("graphdb-migration-history-property-list")
			
			Object.values(entry.propertyStats).forEach(stat => {
				const propItem = propList.createDiv("graphdb-migration-history-property-item")
				propItem.createSpan("graphdb-migration-history-property-name").setText(stat.propertyName)
				propItem.createSpan("graphdb-migration-history-property-stats").setText(
					`${stat.successCount} success, ${stat.errorCount} errors`
				)
			})
		}

		// Relationship errors (if available)
		if (entry.relationshipErrors && entry.relationshipErrors.length > 0) {
			const relErrorsEl = container.createDiv("graphdb-migration-history-section")
			relErrorsEl.createEl("h4", { text: `Relationship creation errors (${entry.relationshipErrors.length})` })
			const relErrorsList = relErrorsEl.createDiv("graphdb-migration-history-errors-list")
			
			entry.relationshipErrors.slice(0, 10).forEach(error => {
				const errorItem = relErrorsList.createDiv("graphdb-migration-history-error-item")
				errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
				errorItem.createSpan("graphdb-migration-history-error-details").setText(
					`${error.property} → ${error.target}: ${error.error}`
				)
			})
			
			if (entry.relationshipErrors.length > 10) {
				relErrorsList.createDiv("graphdb-migration-history-error-more").setText(
					`... and ${entry.relationshipErrors.length - 10} more errors`
				)
			}
		}
	}

	/**
	 * Formats duration in milliseconds to human-readable string
	 */
	private formatDuration(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`
		}
		const seconds = Math.floor(ms / 1000)
		if (seconds < 60) {
			return `${seconds}s`
		}
		const minutes = Math.floor(seconds / 60)
		const remainingSeconds = seconds % 60
		return `${minutes}m ${remainingSeconds}s`
	}
}
