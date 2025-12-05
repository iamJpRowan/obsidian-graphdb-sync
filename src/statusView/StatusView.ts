import { ItemView, Notice, WorkspaceLeaf } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { MigrationService } from "../services/MigrationService"
import { StateService, type PluginState } from "../services/StateService"
import { CredentialService } from "../services/CredentialService"
import { getVaultPath, openSettings } from "../utils/obsidianApi"
import type { MigrationProgress } from "../services/MigrationService"
import { DEFAULT_SETTINGS } from "../types"

export const STATUS_VIEW_TYPE = "graphdb-sync-status"

/**
 * View for displaying migration status and results
 */
export class StatusView extends ItemView {
	plugin: GraphDBSyncPlugin
	private statusContainer: HTMLElement | null = null
	private progressContainer: HTMLElement | null = null
	private resultsContainer: HTMLElement | null = null
	private controlsContainer: HTMLElement | null = null
	private unsubscribeState: (() => void) | null = null
	private lastMigrationState: {
		running: boolean
		paused: boolean
		cancelled: boolean
	} | null = null
	private lastIsReady: boolean | null = null

	constructor(leaf: WorkspaceLeaf, plugin: GraphDBSyncPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return STATUS_VIEW_TYPE
	}

	getDisplayText(): string {
		return "GraphDB Sync Status"
	}

	getIcon(): string {
		return "database"
	}

	async onOpen(): Promise<void> {
		this.render()

		// Subscribe to state changes (callback is called immediately with current state)
		this.unsubscribeState = StateService.subscribe("all", (state: PluginState) => {
			this.updateStatus()
			this.updateProgress(state.migration.progress)
			
			// Track both migration state and isReady to update controls when either changes
			const migrationState = {
				running: state.migration.running,
				paused: state.migration.paused,
				cancelled: state.migration.cancelled,
			}
			
			// Initialize state tracking on first callback (from subscription)
			if (!this.lastMigrationState) {
				this.lastMigrationState = migrationState
				this.lastIsReady = state.isReady
				// Update controls with latest state to ensure button is enabled correctly
				this.updateControls()
				return
			}
			
			// Update controls when migration state OR isReady changes
			const migrationStateChanged =
				this.lastMigrationState.running !== migrationState.running ||
				this.lastMigrationState.paused !== migrationState.paused ||
				this.lastMigrationState.cancelled !== migrationState.cancelled
			
			const isReadyChanged = this.lastIsReady !== state.isReady
			
			if (migrationStateChanged || isReadyChanged) {
				this.lastMigrationState = migrationState
				this.lastIsReady = state.isReady
				this.updateControls()
			}
		})
	}

	async onClose(): Promise<void> {
		// Unsubscribe from state changes
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}
	}

	/**
	 * Renders the view content
	 */
	private render(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-sync-status-view")

		// Status section
		this.statusContainer = contentEl.createDiv("graphdb-status-section")
		this.updateStatus()

		// Progress section
		this.progressContainer = contentEl.createDiv("graphdb-progress-section")
		this.updateProgress(null)

		// Results section
		this.resultsContainer = contentEl.createDiv("graphdb-results-section")
		this.updateResults()

		// Controls section
		this.controlsContainer = contentEl.createDiv("graphdb-controls-section")
		// Controls will be created by subscription callback to ensure latest state
	}

	/**
	 * Updates the status display
	 */
	updateStatus(): void {
		if (!this.statusContainer) return

		this.statusContainer.empty()

		const state = StateService.getState()

		let statusText = ""
		let statusClass = ""

		if (state.migration.running) {
			if (state.migration.paused) {
				statusText = "Migration paused"
				statusClass = "graphdb-status-paused"
			} else {
				statusText = "Migration in progress"
				statusClass = "graphdb-status-running"
			}
		} else if (!state.isReady) {
			if (state.connection.status === "error") {
				statusText = state.connection.error || "Connection error - check settings"
				statusClass = "graphdb-status-error"
			} else {
				statusText = "Not ready - check settings"
				statusClass = "graphdb-status-error"
			}
		} else {
			statusText = "Ready to migrate"
			statusClass = "graphdb-status-ready"
		}

		const statusEl = this.statusContainer.createDiv("graphdb-status")
		statusEl.addClass(statusClass)
		statusEl.setText(statusText)
	}

	/**
	 * Updates the progress display
	 */
	updateProgress(progress: MigrationProgress | null): void {
		if (!this.progressContainer) return

		this.progressContainer.empty()

		if (!progress) {
			const lastResult = this.plugin.settings.lastMigrationResult
			if (lastResult) {
				const progressEl = this.progressContainer.createDiv(
					"graphdb-progress"
				)
				progressEl.createSpan({
					text: `Last migration: ${lastResult.successCount}/${lastResult.totalFiles} files`,
					cls: "graphdb-progress-text",
				})
			}
			return
		}

		const progressEl = this.progressContainer.createDiv("graphdb-progress")

		// Progress bar
		const progressBarContainer = progressEl.createDiv(
			"graphdb-progress-bar-container"
		)
		const progressBar = progressBarContainer.createDiv("graphdb-progress-bar")
		const percentage =
			progress.total > 0 ? (progress.current / progress.total) * 100 : 0
		progressBar.style.width = `${percentage}%`

		// Progress text
		const progressText = progressEl.createDiv("graphdb-progress-text")
		if (progress.status === "scanning") {
			progressText.setText("Scanning for markdown files...")
		} else if (progress.status === "connecting") {
			progressText.setText("Connecting to Neo4j...")
		} else if (progress.status === "migrating") {
			progressText.setText(
				`Migrating: ${progress.current}/${progress.total} files${
					progress.currentFile ? ` - ${progress.currentFile}` : ""
				}`
			)
		}
	}

	/**
	 * Updates the results display
	 */
	updateResults(): void {
		if (!this.resultsContainer) return

		this.resultsContainer.empty()

		const lastResult = this.plugin.settings.lastMigrationResult
		if (!lastResult) {
			const noResultsEl = this.resultsContainer.createDiv(
				"graphdb-results-empty"
			)
			noResultsEl.setText("No migration results yet")
			return
		}

		const resultsEl = this.resultsContainer.createDiv("graphdb-results")
		resultsEl.addClass(
			lastResult.success ? "graphdb-results-success" : "graphdb-results-error"
		)

		// Results header
		const header = resultsEl.createDiv("graphdb-results-header")
		header.createSpan({
			text: lastResult.success ? "✓ Migration completed" : "✗ Migration failed",
			cls: "graphdb-results-title",
		})

		// Results stats
		const stats = resultsEl.createDiv("graphdb-results-stats")
		stats.createDiv({
			text: `Total files: ${lastResult.totalFiles}`,
		})
		stats.createDiv({
			text: `Successful: ${lastResult.successCount}`,
		})
		if (lastResult.errorCount > 0) {
			stats.createDiv({
				text: `Errors: ${lastResult.errorCount}`,
				cls: "graphdb-results-error-count",
			})
		}
		stats.createDiv({
			text: `Duration: ${(lastResult.duration / 1000).toFixed(2)}s`,
		})

		// Timestamp
		const timestamp = new Date(lastResult.timestamp)
		stats.createDiv({
			text: `Completed: ${timestamp.toLocaleString()}`,
			cls: "graphdb-results-timestamp",
		})

		// Errors list (if any)
		if (lastResult.errors.length > 0) {
			const errorsEl = resultsEl.createDiv("graphdb-results-errors")
			errorsEl.createDiv({
				text: "Errors:",
				cls: "graphdb-results-errors-title",
			})
			const errorsList = errorsEl.createDiv("graphdb-results-errors-list")
			lastResult.errors.slice(0, 10).forEach((error) => {
				const errorItem = errorsList.createDiv("graphdb-results-error-item")
				errorItem.createSpan({
					text: error.file,
					cls: "graphdb-results-error-file",
				})
				errorItem.createSpan({
					text: error.error,
					cls: "graphdb-results-error-message",
				})
			})
			if (lastResult.errors.length > 10) {
				errorsList.createDiv({
					text: `... and ${lastResult.errors.length - 10} more errors`,
					cls: "graphdb-results-error-more",
				})
			}
		}
	}

	/**
	 * Updates the controls display
	 */
	updateControls(): void {
		if (!this.controlsContainer) return

		this.controlsContainer.empty()

		const state = StateService.getState()
		const controls = this.controlsContainer.createDiv("graphdb-controls")

		if (state.migration.running) {
			if (state.migration.paused) {
				// Resume button
				const resumeBtn = controls.createEl("button", {
					text: "Resume",
					cls: "mod-cta",
				})
				resumeBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.resume()
					// State changes will trigger subscription updates
				})

				// Cancel button
				const cancelBtn = controls.createEl("button", {
					text: "Cancel",
				})
				cancelBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.cancel()
					// State changes will trigger subscription updates
				})
			} else {
				// Pause button
				const pauseBtn = controls.createEl("button", {
					text: "Pause",
				})
				pauseBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.pause()
					// State changes will trigger subscription updates
				})

				// Cancel button
				const cancelBtn = controls.createEl("button", {
					text: "Cancel",
				})
				cancelBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.cancel()
					// State changes will trigger subscription updates
				})
			}
		} else {
			// Start button
			const startBtn = controls.createEl("button", {
				text: "Start migration",
				cls: "mod-cta",
			})
			startBtn.disabled = !state.isReady
			startBtn.addEventListener("click", async (evt) => {
				evt.preventDefault()
				evt.stopPropagation()
				await this.startMigration()
			})

			// Settings button
			const settingsBtn = controls.createEl("button", {
				text: "Open settings",
			})
			settingsBtn.addEventListener("click", () => {
				openSettings(this.app)
			})
		}
	}

	/**
	 * Starts a migration (public method for external calls)
	 */
	async startMigration(): Promise<void> {
		if (MigrationService.isRunning()) {
			new Notice("Migration already in progress")
			return
		}

		const password = CredentialService.getPassword()
		if (!password) {
			new Notice("Password required - set password in settings")
			return
		}

		const uri =
			this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username =
			this.plugin.settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		const vaultPath = getVaultPath(this.app)

		// Don't manually update - state changes will trigger subscription updates

		try {
			const result = await MigrationService.migrate(
				vaultPath,
				uri,
				{ username, password },
				() => {
					// Progress updates are handled via StateService subscriptions
				}
			)

			// Save result to settings
			this.plugin.settings.lastMigrationResult = {
				...result,
				timestamp: Date.now(),
			}
			await this.plugin.saveSettings()

			// Update display (state changes will trigger updates via subscription)
			this.updateResults()

			if (result.success) {
				new Notice(
					`Migration completed: ${result.successCount}/${result.totalFiles} files`
				)
			} else {
				new Notice(`Migration failed: ${result.message || "Unknown error"}`)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			new Notice(`Migration failed: ${errorMessage}`)

			// Update display (state changes will trigger updates via subscription)
		}
	}

	/**
	 * Refreshes the view (called externally)
	 */
	refresh(): void {
		const state = StateService.getState()
		this.updateStatus()
		this.updateProgress(state.migration.progress)
		this.updateResults()
		this.updateControls()
	}
}

