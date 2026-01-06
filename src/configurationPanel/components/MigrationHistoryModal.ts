import { Modal, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import type { SyncItem, PropertySyncItem, RelationshipSyncItem, LabelSyncItem } from "../../types"

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
		
		history.forEach((entry: SyncItem) => {
			const entryEl = listContainer.createDiv("graphdb-migration-history-entry")
			entryEl.setAttr("data-entry-id", entry.id)
			
			// Entry header (clickable to expand details)
			const headerEl = entryEl.createDiv("graphdb-migration-history-entry-header")
			headerEl.setAttr("role", "button")
			headerEl.setAttr("tabindex", "0")
			
			// Summary with all content
			const summary = headerEl.createDiv("graphdb-migration-history-summary")
			
			// Line 1: Status icon + text, sync type, date/time (all on one row)
			const line1 = summary.createDiv("graphdb-migration-history-line1")
			
			// Status icon and text
			const statusContainer = line1.createDiv("graphdb-migration-history-status-container")
			const statusIcon = statusContainer.createSpan("graphdb-migration-history-status-icon")
			const statusText = statusContainer.createSpan("graphdb-migration-history-status-text")
			
			if (entry.status === "completed") {
				setIcon(statusIcon, "check")
				statusIcon.addClass("success")
				statusText.setText("Completed")
			} else if (entry.status === "cancelled") {
				setIcon(statusIcon, "x")
				statusIcon.addClass("cancelled")
				statusText.setText("Canceled")
			} else if (entry.status === "error") {
				setIcon(statusIcon, "alert-circle")
				statusIcon.addClass("error")
				statusText.setText("Error")
			}
			
			// Sync type and date/time
			let typeText: string
			if (entry.type === "property-sync") {
				typeText = "Property sync"
			} else if (entry.type === "relationship-sync") {
				typeText = "Relationship sync"
			} else if (entry.type === "label-sync") {
				typeText = "Label sync"
			} else {
				typeText = "Sync"
			}
			const dateStr = entry.timestamp !== null 
				? new Date(entry.timestamp).toLocaleString()
				: "No timestamp"
			line1.createSpan("graphdb-migration-history-type").setText(typeText)
			line1.createSpan("graphdb-migration-history-date").setText(` • ${dateStr}`)
			
			// Line 2: Statistics (nodes/relationships/labels created/updated, duration)
			const line2 = summary.createDiv("graphdb-migration-history-line2")
			const statsParts: string[] = []
			
			if (entry.type === "property-sync") {
				if (entry.nodesCreated !== null && entry.nodesCreated > 0) {
					statsParts.push(`${entry.nodesCreated} nodes created`)
				}
				if (entry.nodesUpdated !== null && entry.nodesUpdated > 0) {
					statsParts.push(`${entry.nodesUpdated} nodes updated`)
				}
			} else if (entry.type === "relationship-sync") {
				if (entry.relationshipsCreated !== null && entry.relationshipsCreated > 0) {
					statsParts.push(`${entry.relationshipsCreated} relationships created`)
				}
				if (entry.relationshipsUpdated !== null && entry.relationshipsUpdated > 0) {
					statsParts.push(`${entry.relationshipsUpdated} relationships updated`)
				}
			} else if (entry.type === "label-sync") {
				if (entry.labelsApplied !== null && entry.labelsApplied > 0) {
					statsParts.push(`${entry.labelsApplied} label${entry.labelsApplied === 1 ? "" : "s"} applied`)
				}
			}
			
			// Add duration if available
			if (entry.duration !== null && entry.duration > 0) {
				statsParts.push(this.formatDuration(entry.duration))
			}
			
			if (statsParts.length > 0) {
				const statsText = statsParts.join(" • ")
				line2.createSpan("graphdb-migration-history-stats").setText(statsText)
			} else {
				line2.createSpan("graphdb-migration-history-stats").setText("No statistics available")
			}
			
			// Add error count if available (separate span for styling)
			if (entry.errorCount !== null && entry.errorCount > 0) {
				const errorText = `${entry.errorCount} error${entry.errorCount === 1 ? "" : "s"}`
				if (statsParts.length > 0) {
					line2.createSpan("graphdb-migration-history-stats-separator").setText(" • ")
				}
				line2.createSpan("graphdb-migration-history-stats-error").setText(errorText)
			}
			
			// Expand icon
			const expandIcon = headerEl.createSpan("graphdb-migration-history-expand")
			setIcon(expandIcon, "chevron-down")
			
			// Details section (initially hidden - CSS handles display)
			const detailsEl = entryEl.createDiv("graphdb-migration-history-details")
			this.renderEntryDetails(detailsEl, entry)
			
			// Toggle on click
			let isExpanded = false
			const toggleDetails = () => {
				isExpanded = !isExpanded
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
	 * Renders detailed information for a sync entry
	 */
	private renderEntryDetails(container: HTMLElement, entry: SyncItem): void {
		if (entry.type === "property-sync") {
			this.renderPropertySyncDetails(container, entry)
		} else if (entry.type === "relationship-sync") {
			this.renderRelationshipSyncDetails(container, entry)
		} else if (entry.type === "label-sync") {
			this.renderLabelSyncDetails(container, entry)
		}

		// Errors (common to all types except FileSyncItem)
		if ((entry.type === "property-sync" || entry.type === "relationship-sync" || entry.type === "label-sync") && entry.errors && entry.errors.length > 0) {
			const errorsEl = container.createDiv("graphdb-migration-history-section")
			errorsEl.createEl("h4", { text: `Errors (${entry.errors.length})` })
			const errorsList = errorsEl.createDiv("graphdb-migration-history-errors-list")
			
			// Handle errors based on entry type
			if (entry.type === "relationship-sync") {
				// Relationship errors have property and target
				entry.errors.slice(0, 10).forEach((error: { file: string; property: string; target: string; error: string }) => {
					const errorItem = errorsList.createDiv("graphdb-migration-history-error-item")
					errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
					errorItem.createSpan("graphdb-migration-history-error-details").setText(
						`${error.property} → ${error.target}: ${error.error}`
					)
				})
			} else if (entry.type === "label-sync") {
				// Label errors have file, label, and error
				entry.errors.slice(0, 10).forEach((error: { file: string; label: string; error: string }) => {
					const errorItem = errorsList.createDiv("graphdb-migration-history-error-item")
					errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
					errorItem.createSpan("graphdb-migration-history-error-details").setText(
						`${error.label}: ${error.error}`
					)
				})
			} else if (entry.type === "property-sync") {
				// Property sync errors only have file and error
				entry.errors.slice(0, 10).forEach((error: { file: string; error: string }) => {
					const errorItem = errorsList.createDiv("graphdb-migration-history-error-item")
					errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
					errorItem.createSpan("graphdb-migration-history-error-details").setText(error.error)
				})
			}
			
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
	private renderPropertySyncDetails(container: HTMLElement, entry: PropertySyncItem): void {
		// Properties synced
		const propsEl = container.createDiv("graphdb-migration-history-section")
		propsEl.createEl("h4", { text: "Properties synced" })
		const propsArray = entry.properties instanceof Set 
			? Array.from(entry.properties)
			: entry.properties
		if (propsArray.length > 0) {
			propsEl.createSpan().setText(propsArray.join(", "))
		} else {
			propsEl.createSpan().setText("No properties")
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
	private renderRelationshipSyncDetails(container: HTMLElement, entry: RelationshipSyncItem): void {
		// Properties synced
		const propsEl = container.createDiv("graphdb-migration-history-section")
		propsEl.createEl("h4", { text: "Properties synced" })
		const propsArray = entry.properties instanceof Set 
			? Array.from(entry.properties)
			: entry.properties
		if (propsArray.length > 0) {
			propsEl.createSpan().setText(propsArray.join(", "))
		} else {
			propsEl.createSpan().setText("No properties")
		}

		// Relationship stats
		if (entry.relationshipStats) {
			const relStatsEl = container.createDiv("graphdb-migration-history-section")
			relStatsEl.createEl("h4", { text: "Relationships" })
			relStatsEl.createSpan().setText(
				`${entry.relationshipStats.successCount} created, ${entry.relationshipStats.errorCount} errors`
			)
		}

		// Property counts
		if (entry.relationshipPropertyCounts && Object.keys(entry.relationshipPropertyCounts).length > 0) {
			const propStatsEl = container.createDiv("graphdb-migration-history-section")
			propStatsEl.createEl("h4", { text: "Property statistics" })
			const propList = propStatsEl.createDiv("graphdb-migration-history-property-list")
			
			Object.entries(entry.relationshipPropertyCounts).forEach(([propertyName, counts]) => {
				const propItem = propList.createDiv("graphdb-migration-history-property-item")
				propItem.createSpan("graphdb-migration-history-property-name").setText(propertyName)
				propItem.createSpan("graphdb-migration-history-property-stats").setText(
					`${counts.successCount} success, ${counts.errorCount} errors`
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
	 * Renders details for label sync entry
	 */
	private renderLabelSyncDetails(container: HTMLElement, entry: LabelSyncItem): void {
		// Labels synced
		const labelsEl = container.createDiv("graphdb-migration-history-section")
		labelsEl.createEl("h4", { text: "Labels synced" })
		const labelsArray = entry.properties instanceof Set 
			? Array.from(entry.properties)
			: entry.properties
		if (labelsArray.length > 0) {
			labelsEl.createSpan().setText(labelsArray.join(", "))
		} else {
			labelsEl.createSpan().setText("No labels")
		}

		// Label statistics
		if (entry.labelsApplied !== null) {
			const labelStatsEl = container.createDiv("graphdb-migration-history-section")
			labelStatsEl.createEl("h4", { text: "Statistics" })
			labelStatsEl.createSpan().setText(
				`${entry.labelsApplied} label${entry.labelsApplied === 1 ? "" : "s"} applied`
			)
		}

		// Label errors (if available)
		if (entry.labelErrors && entry.labelErrors.length > 0) {
			const labelErrorsEl = container.createDiv("graphdb-migration-history-section")
			labelErrorsEl.createEl("h4", { text: `Label application errors (${entry.labelErrors.length})` })
			const labelErrorsList = labelErrorsEl.createDiv("graphdb-migration-history-errors-list")
			
			entry.labelErrors.slice(0, 10).forEach(error => {
				const errorItem = labelErrorsList.createDiv("graphdb-migration-history-error-item")
				errorItem.createSpan("graphdb-migration-history-error-file").setText(error.file)
				errorItem.createSpan("graphdb-migration-history-error-details").setText(
					`${error.label}: ${error.error}`
				)
			})
			
			if (entry.labelErrors.length > 10) {
				labelErrorsList.createDiv("graphdb-migration-history-error-more").setText(
					`... and ${entry.labelErrors.length - 10} more errors`
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
