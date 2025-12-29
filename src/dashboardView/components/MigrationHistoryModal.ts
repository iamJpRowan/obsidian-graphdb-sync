import { Modal, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import type { MigrationHistoryEntry } from "../../types"

/**
 * Modal for displaying migration history and detailed results
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
		titleContainer.createEl("h2", { text: "Migration history" })

		// History list
		const history = this.plugin.settings.migrationHistory || []
		
		if (history.length === 0) {
			const emptyState = contentEl.createDiv("graphdb-migration-history-empty")
			emptyState.setText("No migration history available")
			return
		}

		const listContainer = contentEl.createDiv("graphdb-migration-history-list")
		
		history.forEach((entry: MigrationHistoryEntry) => {
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
			
			// Summary
			const summary = headerEl.createDiv("graphdb-migration-history-summary")
			const date = new Date(entry.timestamp)
			summary.createSpan("graphdb-migration-history-date").setText(date.toLocaleString())
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
	 * Renders detailed information for a migration entry
	 */
	private renderEntryDetails(container: HTMLElement, entry: MigrationHistoryEntry): void {
		// Phases executed
		if (entry.phasesExecuted && entry.phasesExecuted.length > 0) {
			const phasesEl = container.createDiv("graphdb-migration-history-section")
			phasesEl.createEl("h4", { text: "Phases executed" })
			phasesEl.createSpan().setText(entry.phasesExecuted.join(", "))
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

		// Errors
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

