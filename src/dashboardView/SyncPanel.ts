import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { SyncQueueService } from "../services/SyncQueueService"
import { CredentialService } from "../services/CredentialService"
import { StateService, type MigrationState } from "../services/StateService"
import { pauseSync, resumeSync, cancelSync } from "../services/SyncService"
import { PasswordPrompt } from "./components/PasswordPrompt"
import { MigrationHistoryModal } from "./components/MigrationHistoryModal"
import { SyncQueueModal } from "./components/SyncQueueModal"
import type { SyncQueueState } from "../types"

/**
 * Sync panel component
 * Handles full syncs and displays sync status
 */
export class SyncPanel {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private statusBarLine: HTMLElement | null = null
	private actionLine: HTMLElement | null = null
	private unsubscribeState: (() => void) | null = null
	private lastMigrationState: MigrationState | null = null
	private lastQueueState: SyncQueueState | null = null
	private pendingCancelTimeout: number | null = null
	private pendingCancelInterval: number | null = null
	private pendingCancelStartTime: number | null = null

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin) {
		this.container = container
		this.plugin = plugin
		this.render()
		this.subscribeToState()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-migration-panel")

		// Status bar line: controls + progress bar + view queue
		this.statusBarLine = this.container.createDiv("graphdb-migration-status-bar-line")

		// Action line: status text | history link | run sync button
		this.actionLine = this.container.createDiv("graphdb-migration-action-line")

		// Render everything based on current state
		this.renderAll()
	}

	/**
	 * Subscribes to state changes for real-time updates
	 */
	private subscribeToState(): void {
		this.unsubscribeState = StateService.subscribe("all", () => {
			this.renderAll()
		})
	}

	/**
	 * Unified render method - renders both lines based on current state
	 */
	private renderAll(): void {
		if (!this.statusBarLine || !this.actionLine) return

		const migrationState = StateService.getMigrationStatus()
		const queueState = StateService.getQueueState()

		// Clear pending cancel if sync is no longer running or is cancelled
		if (this.pendingCancelTimeout !== null && (!migrationState.running || migrationState.cancelled)) {
			this.clearPendingCancel()
		}

		// Determine if status bar line should be visible
		const shouldShowStatusBar = queueState.current !== null || 
		                             queueState.queue.length > 0 || 
		                             migrationState.running

		// Show/hide status bar line
		this.statusBarLine.style.display = shouldShowStatusBar ? "flex" : "none"

		// Check if we need to re-render the status bar line structure
		// Only re-render if the structure changed (running state, paused, cancelled, queue changes)
		// Not on every progress update
		// Also re-render if pending cancel state changes (to update countdown)
		const hasPendingCancel = this.pendingCancelTimeout !== null
		const needsFullRerender = 
			!this.lastMigrationState ||
			this.lastMigrationState.running !== migrationState.running ||
			this.lastMigrationState.paused !== migrationState.paused ||
			this.lastMigrationState.cancelled !== migrationState.cancelled ||
			!this.lastQueueState ||
			this.lastQueueState.current?.id !== queueState.current?.id ||
			this.lastQueueState.queue.length !== queueState.queue.length ||
			hasPendingCancel // Re-render when pending cancel state changes

		// Render status bar line (only if visible)
		if (shouldShowStatusBar) {
			if (needsFullRerender) {
				this.renderStatusBarLine(migrationState, queueState)
			} else {
				// Just update progress bar without re-rendering everything
				this.updateProgressBar(migrationState)
			}
		}

		// Always render action line
		this.renderActionLine(migrationState)

		// Store current state for next comparison
		this.lastMigrationState = { ...migrationState }
		this.lastQueueState = { 
			queue: [...queueState.queue],
			current: queueState.current ? { ...queueState.current } : null
		}
	}

	/**
	 * Renders the progress bar or status message into a container
	 */
	private renderProgressStatus(container: HTMLElement, migrationState: MigrationState): void {
		container.empty()

		// Check for pending cancel first (sync is paused during this)
		if (this.pendingCancelTimeout !== null && this.pendingCancelStartTime !== null) {
			const elapsed = Date.now() - this.pendingCancelStartTime
			const remaining = Math.max(0, Math.ceil((5000 - elapsed) / 1000))
			
			const cancelContainer = container.createDiv("graphdb-migration-progress-pending-cancel-container")
			
			const cancelIcon = cancelContainer.createSpan("graphdb-migration-progress-pending-cancel-icon")
			setIcon(cancelIcon, "x")
			
			const cancelText = cancelContainer.createSpan("graphdb-migration-progress-pending-cancel")
			cancelText.setText(`Cancelling in ${remaining}...`)
		} else if (migrationState.paused) {
			const pausedContainer = container.createDiv("graphdb-migration-progress-paused-container")
			
			const pausedIcon = pausedContainer.createSpan("graphdb-migration-progress-paused-icon")
			setIcon(pausedIcon, "pause")
			
			const pausedText = pausedContainer.createSpan("graphdb-migration-progress-paused")
			pausedText.setText("Sync paused")
		} else if (migrationState.cancelled) {
			const cancelledEl = container.createSpan("graphdb-migration-progress-cancelled")
			cancelledEl.setText("✗ Sync cancelled")
		} else if (migrationState.progress) {
			this.renderProgressBar(container, migrationState.progress)
		} else if (migrationState.running) {
			const startingEl = container.createSpan("graphdb-migration-progress-text")
			startingEl.setText("Starting sync...")
		}
	}

	/**
	 * Updates only the progress bar without re-rendering the entire line
	 */
	private updateProgressBar(migrationState: MigrationState): void {
		if (!this.statusBarLine) return

		const statusContainer = this.statusBarLine.querySelector(".graphdb-migration-status-container") as HTMLElement | null
		if (!statusContainer) return

		this.renderProgressStatus(statusContainer, migrationState)
	}

	/**
	 * Renders the status bar line with controls, progress bar, and view queue link
	 */
	private renderStatusBarLine(migrationState: MigrationState, queueState: SyncQueueState): void {
		if (!this.statusBarLine) return

		this.statusBarLine.empty()

		// Progress bar container
		const statusContainer = this.statusBarLine.createDiv("graphdb-migration-status-container")
		this.renderProgressStatus(statusContainer, migrationState)

		// View Queue link (before controls)
		this.createClickableElement(
			this.statusBarLine,
			"View queue",
			() => {
				new SyncQueueModal(this.plugin).open()
			},
			"graphdb-migration-history-link"
		)

		// Control icons container (on the far right)
		const controlsContainer = this.statusBarLine.createDiv("graphdb-sync-controls-container")

		// Pause/Resume button (only when sync is running and not cancelled)
		if (migrationState.running && !migrationState.cancelled) {
			this.createControlIcon(
				controlsContainer,
				migrationState.paused ? "play" : "pause",
				migrationState.paused ? "Resume sync" : "Pause sync",
				(e) => {
					e.stopPropagation()
					e.preventDefault()
					// Get fresh state when clicked
					const currentState = StateService.getMigrationStatus()
					if (currentState.paused) {
						resumeSync()
					} else {
						pauseSync()
					}
				}
			)
		}

		// Cancel button (transforms to undo when pending cancel is active)
		if (migrationState.running) {
			if (this.pendingCancelTimeout !== null) {
				// Show undo button (same position as cancel)
				this.createControlIcon(
					controlsContainer,
					"undo",
					"Undo cancel",
					(e) => {
						e.stopPropagation()
						e.preventDefault()
						this.handleUndoCancel()
					}
				)
			} else {
				// Show normal cancel button
				this.createControlIcon(
					controlsContainer,
					"x",
					"Cancel sync",
					(e) => {
						e.stopPropagation()
						e.preventDefault()
						this.startPendingCancel()
					}
				)
			}
		}
	}

	/**
	 * Renders the action line with status text, history link, and run sync button
	 */
	private renderActionLine(migrationState: MigrationState): void {
		if (!this.actionLine) return

		this.actionLine.empty()

		// Status text container
		const statusTextContainer = this.actionLine.createDiv("graphdb-migration-status-text-container")
		this.renderStatusText(statusTextContainer, migrationState)

		// View History link (if history exists)
		const history = this.plugin.settings.syncHistory
		if (history && history.length > 0) {
			this.createClickableElement(
				this.actionLine,
				"View history",
				() => {
					new MigrationHistoryModal(this.plugin).open()
				},
				"graphdb-migration-history-link"
			)
		}

		// Run sync button
		this.createIconButton(
			this.actionLine,
			"database-backup",
			"Run sync",
			"Start sync",
			() => {
				this.startFullSync()
			}
		)
	}

	/**
	 * Renders status text
	 */
	private renderStatusText(container: HTMLElement, migrationState: MigrationState): void {
		container.empty()

		// Show progress text during sync
		if (migrationState.running && migrationState.progress) {
			const progress = migrationState.progress
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
	 * Renders progress bar
	 */
	private renderProgressBar(
		container: HTMLElement,
		progress: import("../services/SyncService/types").SyncProgress
	): void {
		const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

		const progressBarContainer = container.createDiv("graphdb-migration-progress-bar-container")
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

	/**
	 * Creates a clickable element with keyboard support
	 */
	private createClickableElement(
		container: HTMLElement,
		text: string,
		onClick: () => void,
		className: string = "graphdb-migration-history-link"
	): HTMLElement {
		const el = container.createSpan(className)
		el.setText(text)
		el.setAttr("role", "button")
		el.setAttr("tabindex", "0")
		el.addEventListener("click", (e) => {
			e.stopPropagation()
			e.preventDefault()
			onClick()
		})
		el.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				e.stopPropagation()
				onClick()
			}
		})
		return el
	}

	/**
	 * Creates an icon button with text
	 */
	private createIconButton(
		container: HTMLElement,
		iconName: string,
		text: string,
		ariaLabel: string,
		onClick: () => void
	): HTMLElement {
		const iconContainer = container.createDiv("graphdb-migration-icon-container")
		const iconButton = iconContainer.createDiv("graphdb-migration-icon-button")
		setIcon(iconButton, iconName)
		const buttonText = iconContainer.createSpan("graphdb-migration-icon-text")
		buttonText.setText(text)
		iconContainer.setAttr("aria-label", ariaLabel)
		iconContainer.setAttr("role", "button")
		iconContainer.setAttr("tabindex", "0")
		iconContainer.addEventListener("click", onClick)
		iconContainer.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				onClick()
			}
		})
		return iconContainer
	}

	/**
	 * Creates a control icon (pause/resume/cancel) for the status bar
	 */
	private createControlIcon(
		container: HTMLElement,
		iconName: string,
		ariaLabel: string,
		onClick: (e: MouseEvent | KeyboardEvent) => void
	): HTMLElement {
		const iconBtn = container.createSpan("graphdb-sync-control-icon")
		setIcon(iconBtn, iconName)
		iconBtn.setAttr("role", "button")
		iconBtn.setAttr("tabindex", "0")
		iconBtn.setAttr("aria-label", ariaLabel)
		
		// Use capture phase to ensure we get the event
		iconBtn.addEventListener("click", (e) => {
			e.stopPropagation()
			e.preventDefault()
			onClick(e)
		}, true)
		
		iconBtn.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				e.stopPropagation()
				onClick(e)
			}
		})
		return iconBtn
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
	 * Starts the pending cancel countdown
	 */
	private startPendingCancel(): void {
		// Clear any existing pending cancel
		this.clearPendingCancel()

		// Pause the sync immediately
		const currentState = StateService.getMigrationStatus()
		if (!currentState.paused) {
			pauseSync()
		}

		// Start countdown
		this.pendingCancelStartTime = Date.now()
		const CANCEL_DELAY_MS = 5000

		// Update countdown every second
		this.pendingCancelInterval = window.setInterval(() => {
			// Trigger re-render to update countdown display
			this.renderAll()
		}, 1000)

		// Set timeout to actually cancel after delay
		this.pendingCancelTimeout = window.setTimeout(() => {
			this.executeCancel()
		}, CANCEL_DELAY_MS)

		// Trigger re-render to show pending cancel UI
		this.renderAll()
	}

	/**
	 * Clears the pending cancel state
	 */
	private clearPendingCancel(): void {
		if (this.pendingCancelTimeout !== null) {
			window.clearTimeout(this.pendingCancelTimeout)
			this.pendingCancelTimeout = null
		}
		if (this.pendingCancelInterval !== null) {
			window.clearInterval(this.pendingCancelInterval)
			this.pendingCancelInterval = null
		}
		this.pendingCancelStartTime = null
	}

	/**
	 * Handles undo of pending cancel
	 */
	private handleUndoCancel(): void {
		this.clearPendingCancel()
		
		// Resume the sync
		const currentState = StateService.getMigrationStatus()
		if (currentState.paused) {
			resumeSync()
		}

		// Trigger re-render to restore normal UI
		this.renderAll()
	}

	/**
	 * Executes the actual cancel
	 */
	private executeCancel(): void {
		// Clear pending cancel state
		this.clearPendingCancel()

		// Get fresh state when executing
		const currentQueueState = StateService.getQueueState()
		
		// Cancel the sync
		cancelSync()
		
		// Remove current item from queue if it exists
		if (currentQueueState.current) {
			SyncQueueService.removeItem(currentQueueState.current.id)
		}

		// Trigger re-render to show cancelled state
		this.renderAll()
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		// Clear any pending cancel timers
		this.clearPendingCancel()

		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}
	}
}
