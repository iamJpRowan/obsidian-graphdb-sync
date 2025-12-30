import { Modal, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { StateService } from "../../services/StateService"
import { SyncQueueService } from "../../services/SyncQueueService"

/**
 * Modal for displaying sync queue and managing queue items
 */
export class SyncQueueModal extends Modal {
	private plugin: GraphDBSyncPlugin
	private unsubscribeQueue: (() => void) | null = null
	private listContainer: HTMLElement | null = null

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
		setIcon(titleIcon, "list-ordered")
		titleContainer.createEl("h2", { text: "Sync queue" })

		// Create container for queue items (will be updated on state changes)
		this.listContainer = contentEl.createDiv("graphdb-migration-history-list")

		// Subscribe to queue state changes
		this.unsubscribeQueue = StateService.subscribe("queue", () => {
			this.renderQueueItems()
		})

		// Initial render
		this.renderQueueItems()
	}

	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
		
		// Clean up subscription
		if (this.unsubscribeQueue) {
			this.unsubscribeQueue()
			this.unsubscribeQueue = null
		}
		
		this.listContainer = null
	}

	/**
	 * Renders queue items based on current state
	 */
	private renderQueueItems(): void {
		if (!this.listContainer) return

		// Clear existing items
		this.listContainer.empty()

		// Get current queue state
		const queueState = StateService.getQueueState()

		if (queueState.queue.length === 0 && !queueState.current) {
			const emptyState = this.listContainer.createDiv("graphdb-migration-history-empty")
			emptyState.setText("Queue is empty")
			return
		}

		// Show current item if processing
		if (queueState.current) {
			const currentEl = this.listContainer.createDiv("graphdb-migration-history-entry")
			this.renderQueueItem(currentEl, queueState.current, true)
		}

		// Show pending items
		queueState.queue.forEach((item) => {
			const itemEl = this.listContainer!.createDiv("graphdb-migration-history-entry")
			this.renderQueueItem(itemEl, item, false)
		})
	}

	/**
	 * Renders a queue item
	 */
	private renderQueueItem(
		container: HTMLElement,
		item: import("../../types").SyncQueueItem,
		isCurrent: boolean
	): void {
		// Entry header (matching history modal structure)
		const headerEl = container.createDiv("graphdb-migration-history-entry-header")
		
		// Status icon
		const statusIcon = headerEl.createSpan("graphdb-migration-history-status-icon")
		if (isCurrent) {
			statusIcon.addClass("processing")
			const spinner = statusIcon.createSpan("graphdb-sync-queue-item-spinner")
			setIcon(spinner, "sync")
			spinner.addClass("graphdb-sync-queue-item-spinner-rotating")
		} else {
			setIcon(statusIcon, "clock")
		}

		// Summary
		const summary = headerEl.createDiv("graphdb-migration-history-summary")
		
		// Type
		const typeEl = summary.createSpan("graphdb-migration-history-date")
		typeEl.setText(
			item.type === "property-sync" ? "Property sync" : "Relationship sync"
		)

		// Properties
		const propsEl = summary.createSpan("graphdb-migration-history-stats")
		if (item.properties === undefined) {
			propsEl.setText("All properties")
		} else if (item.properties.size === 0) {
			propsEl.setText("All properties")
		} else {
			const propsArray = Array.from(item.properties)
			propsEl.setText(propsArray.join(", "))
		}

		// Remove button (only for pending items) - positioned like expand icon
		if (!isCurrent) {
			const removeBtn = headerEl.createSpan("graphdb-migration-history-expand")
			setIcon(removeBtn, "x")
			removeBtn.setAttr("role", "button")
			removeBtn.setAttr("tabindex", "0")
			removeBtn.setAttr("aria-label", "Remove from queue")
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation()
				SyncQueueService.removeItem(item.id)
				// Re-render will happen automatically via subscription
			})
			removeBtn.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					SyncQueueService.removeItem(item.id)
					// Re-render will happen automatically via subscription
				}
			})
		}
	}
}

