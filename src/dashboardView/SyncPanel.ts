import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { SyncQueueService } from "../services/SyncQueueService"
import { CredentialService } from "../services/CredentialService"
import { StateService } from "../services/StateService"
import { PasswordPrompt } from "./components/PasswordPrompt"
import { MigrationHistoryModal } from "./components/MigrationHistoryModal"
import { SyncQueueModal } from "./components/SyncQueueModal"
import type { PluginState } from "../services/StateService"

/**
 * Sync panel component
 * Handles full syncs and displays sync status
 */
export class SyncPanel {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private statusContainer: HTMLElement | null = null
	private statusTextContainer: HTMLElement | null = null
	private unsubscribeState: (() => void) | null = null

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin) {
		this.container = container
		this.plugin = plugin
		this.render()
		this.subscribeToState()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-migration-panel")

		// Status bar line: full-width progress bar
		const statusBarLine = this.container.createDiv("graphdb-migration-status-bar-line")
		this.statusContainer = statusBarLine.createDiv("graphdb-migration-status-container")
		this.renderStatus()

		// Action line: status text | icon button with text
		const actionLine = this.container.createDiv("graphdb-migration-action-line")
		this.statusTextContainer = actionLine.createDiv("graphdb-migration-status-text-container")
		this.renderStatusText(this.statusTextContainer)
		
		// View History link (if history exists)
		const history = this.plugin.settings.syncHistory
		if (history && history.length > 0) {
			const historyLink = actionLine.createSpan("graphdb-migration-history-link")
			historyLink.setText("View history")
			historyLink.setAttr("role", "button")
			historyLink.setAttr("tabindex", "0")
			historyLink.addEventListener("click", () => {
				new MigrationHistoryModal(this.plugin).open()
			})
			historyLink.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					new MigrationHistoryModal(this.plugin).open()
				}
			})
		}

		// View Queue link
		const queueLink = actionLine.createSpan("graphdb-migration-history-link")
		queueLink.setText("View queue")
		queueLink.setAttr("role", "button")
		queueLink.setAttr("tabindex", "0")
		queueLink.addEventListener("click", () => {
			new SyncQueueModal(this.plugin).open()
		})
		queueLink.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				new SyncQueueModal(this.plugin).open()
			}
		})
		
		const iconContainer = actionLine.createDiv("graphdb-migration-icon-container")
		const iconButton = iconContainer.createDiv("graphdb-migration-icon-button")
		setIcon(iconButton, "database-backup")
		const buttonText = iconContainer.createSpan("graphdb-migration-icon-text")
		buttonText.setText("Run sync")
		iconContainer.setAttr("aria-label", "Start sync")
		iconContainer.setAttr("role", "button")
		iconContainer.setAttr("tabindex", "0")
		iconContainer.addEventListener("click", () => {
			this.startFullSync()
		})
		iconContainer.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				this.startFullSync()
			}
		})
	}

	/**
	 * Subscribes to state changes for real-time updates
	 */
	private subscribeToState(): void {
		this.unsubscribeState = StateService.subscribe("migration", (state: PluginState) => {
			this.onSyncStateChange(state)
		})
	}

	/**
	 * Handles sync state changes
	 */
	private onSyncStateChange(state: PluginState): void {
		// Always re-render both status bar and status text based on current state
		this.renderStatus()
		if (this.statusTextContainer) {
			this.renderStatusText(this.statusTextContainer)
		}
	}


	private renderStatus(): void {
		if (!this.statusContainer) return

		this.statusContainer.empty()

		const state = StateService.getMigrationStatus()
		
		// Show progress bar if sync is running
		if (state.running) {
			if (state.paused) {
				const pausedEl = this.statusContainer.createSpan("graphdb-migration-progress-paused")
				pausedEl.setText("⏸ Sync paused")
			} else if (state.cancelled) {
				const cancelledEl = this.statusContainer.createSpan("graphdb-migration-progress-cancelled")
				cancelledEl.setText("✗ Sync cancelled")
			} else if (state.progress) {
				this.renderProgressBar(state.progress)
			} else {
				const startingEl = this.statusContainer.createSpan("graphdb-migration-progress-text")
				startingEl.setText("Starting sync...")
			}
		}
		// Leave empty when idle (status text is shown on action line)
	}

	/**
	 * Renders status text on the action line (next to Run sync button)
	 */
	private renderStatusText(container: HTMLElement): void {
		container.empty()

		const state = StateService.getMigrationStatus()
		
		// Show progress text during sync
		if (state.running && state.progress) {
			const progress = state.progress
			const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
			const statusText = this.getStatusText(progress.status)
			const statusEl = container.createSpan("graphdb-migration-status-text")
			statusEl.setText(`${statusText}: ${progress.current}/${progress.total} (${percentage}%)`)
			return
		}

		// Show last result if available (when idle)
		const history = this.plugin.settings.syncHistory
		const lastResult = history && history.length > 0 ? history[0] : null
		
		if (lastResult) {
			const statusText = lastResult.success
				? `✓ Last: ${lastResult.successCount}/${lastResult.totalFiles} files`
				: `✗ ${lastResult.errorCount} errors`
			const statusEl = container.createSpan("graphdb-migration-status-text")
			statusEl.setText(statusText)
			statusEl.addClass(lastResult.success ? "graphdb-migration-status-success" : "graphdb-migration-status-error")
		}
	}

	/**
	 * Renders progress bar on the status bar line (bar only, no text)
	 */
	private renderProgressBar(progress: import("../services/SyncService/types").SyncProgress): void {
		if (!this.statusContainer) return

		const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
		
		// Progress bar only (text is shown on action line)
		const progressBarContainer = this.statusContainer.createDiv("graphdb-migration-progress-bar-container")
		const progressBar = progressBarContainer.createDiv("graphdb-migration-progress-bar")
		progressBar.style.width = `${percentage}%`
	}

	/**
	 * Gets human-readable status text
	 */
	private getStatusText(status: string): string {
		const statusMap: Record<string, string> = {
			scanning: "Scanning files",
			connecting: "Connecting",
			creating_nodes: "Creating nodes",
			updating_properties: "Updating properties",
			creating_relationships: "Creating relationships",
		}
		return statusMap[status] || status
	}


	private async startFullSync(): Promise<void> {
		// Get password
		let password = CredentialService.getPassword()
		if (!password) {
			password = await PasswordPrompt.prompt(this.plugin)
			if (!password) {
				return
			}
		}

		// Add full sync to queue (property-sync then relationship-sync)
		SyncQueueService.addFullSync(this.plugin.settings)
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}
	}
}

