import { setIcon, Notice, type App } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import { MigrationService } from "../../services/MigrationService"
import { StateService } from "../../services/StateService"
import { CredentialService } from "../../services/CredentialService"
import { getVaultPath, openSettings } from "../../utils/obsidianApi"
import { DEFAULT_SETTINGS, type RelationshipError } from "../../types"
import type { MigrationProgress } from "../../services/MigrationService"

/**
 * Migration tab component for displaying migration status, progress, and controls
 */
export class MigrationTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private statusContainer: HTMLElement | null = null
	private progressContainer: HTMLElement | null = null
	private resultsContainer: HTMLElement | null = null
	private controlsContainer: HTMLElement | null = null
	private app: App

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin, app: App) {
		this.container = container
		this.plugin = plugin
		this.app = app
	}

	/**
	 * Renders the migration tab
	 */
	render(): void {
		this.container.empty()

		// Status section
		this.statusContainer = this.container.createDiv("graphdb-status-section")
		this.updateStatus()

		// Progress section
		this.progressContainer = this.container.createDiv("graphdb-progress-section")
		this.updateProgress(null)

		// Results section
		this.resultsContainer = this.container.createDiv("graphdb-results-section")
		this.updateResults()

		// Controls section
		this.controlsContainer = this.container.createDiv("graphdb-controls-section")
		this.updateControls()
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
		progressBar.style.setProperty("--progress-width", `${percentage}%`)

		// Progress text
		const progressText = progressEl.createDiv("graphdb-progress-text")
		if (progress.status === "scanning") {
			progressText.setText("Scanning for markdown files...")
		} else if (progress.status === "connecting") {
			progressText.setText("Connecting to Neo4j...")
		} else if (progress.status === "creating_nodes") {
			progressText.setText(
				`Creating nodes: ${progress.current}/${progress.total} files${
					progress.currentFile ? ` - ${progress.currentFile}` : ""
				}`
			)
		} else if (progress.status === "creating_relationships") {
			progressText.setText(
				`Creating relationships: ${progress.current}/${progress.total} files${
					progress.currentFile ? ` - ${progress.currentFile}` : ""
				}`
			)
		} else if (progress.status === "migrating") {
			// Fallback for old status
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
		const titleEl = header.createDiv("graphdb-results-title")
		const iconEl = titleEl.createSpan("graphdb-results-title-icon")
		setIcon(iconEl, lastResult.success ? "check-circle" : "x-circle")
		titleEl.createSpan({
			text: lastResult.success
				? " Migration completed"
				: " Migration failed",
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
		
		// Relationship statistics (if available)
		if (lastResult.relationshipStats) {
			stats.createDiv({
				text: `Relationships created: ${lastResult.relationshipStats.successCount}`,
			})
			if (lastResult.relationshipStats.errorCount > 0) {
				stats.createDiv({
					text: `Relationship errors: ${lastResult.relationshipStats.errorCount}`,
					cls: "graphdb-results-error-count",
				})
			}
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
				
				// Type guard to check if this is a RelationshipError
				const isRelationshipError = (err: { file: string; error: string } | RelationshipError): err is RelationshipError => {
					return "property" in err && "target" in err
				}
				
				if (isRelationshipError(error)) {
					// Relationship error
					errorItem.createSpan({
						text: `${error.file} (${error.property} → ${error.target})`,
						cls: "graphdb-results-error-file",
					})
					errorItem.createSpan({
						text: error.error,
						cls: "graphdb-results-error-message",
					})
				} else {
					// Node creation error
					errorItem.createSpan({
						text: error.file,
						cls: "graphdb-results-error-file",
					})
					errorItem.createSpan({
						text: error.error,
						cls: "graphdb-results-error-message",
					})
				}
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
				})

				// Cancel button
				const cancelBtn = controls.createEl("button", {
					text: "Cancel",
				})
				cancelBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.cancel()
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
				})

				// Cancel button
				const cancelBtn = controls.createEl("button", {
					text: "Cancel",
				})
				cancelBtn.addEventListener("click", (evt) => {
					evt.preventDefault()
					evt.stopPropagation()
					MigrationService.cancel()
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

			// Create relationships only button
			const createRelationshipsBtn = controls.createEl("button", {
				text: "Create relationships only",
			})
			const hasPropertyMappings = this.plugin.settings.propertyMappings && Object.keys(this.plugin.settings.propertyMappings).length > 0
			createRelationshipsBtn.disabled = !state.isReady || !hasPropertyMappings
			createRelationshipsBtn.addEventListener("click", async (evt) => {
				evt.preventDefault()
				evt.stopPropagation()
				await this.startRelationshipCreation()
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
	 * Starts relationship creation only (skips node creation)
	 */
	async startRelationshipCreation(): Promise<void> {
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

		try {
			const result = await MigrationService.createRelationshipsOnly(
				vaultPath,
				uri,
				{ username, password },
				() => {
					// Progress updates are handled via StateService subscriptions
				},
				this.app,
				this.plugin.settings
			)

			// Save result to settings
			this.plugin.settings.lastMigrationResult = {
				...result,
				timestamp: Date.now(),
			}
			await this.plugin.saveSettings()

			// Update display
			this.updateResults()

			if (result.success) {
				let noticeText = `Relationships created: ${result.relationshipStats?.successCount || 0}`
				if (result.relationshipStats?.errorCount && result.relationshipStats.errorCount > 0) {
					noticeText += ` (${result.relationshipStats.errorCount} errors)`
				}
				new Notice(noticeText)
			} else {
				new Notice(`Relationship creation failed: ${result.message || "Unknown error"}`)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			new Notice(`Relationship creation failed: ${errorMessage}`)
		}
	}

	/**
	 * Starts a migration
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

		try {
			const result = await MigrationService.migrate(
				vaultPath,
				uri,
				{ username, password },
				() => {
					// Progress updates are handled via StateService subscriptions
				},
				this.app,
				this.plugin.settings
			)

			// Save result to settings
			this.plugin.settings.lastMigrationResult = {
				...result,
				timestamp: Date.now(),
			}
			await this.plugin.saveSettings()

			// Update display
			this.updateResults()

			if (result.success) {
				let noticeText = `Migration completed: ${result.successCount}/${result.totalFiles} files`
				if (result.relationshipStats) {
					noticeText += `, ${result.relationshipStats.successCount} relationships`
					if (result.relationshipStats.errorCount > 0) {
						noticeText += ` (${result.relationshipStats.errorCount} errors)`
					}
				}
				new Notice(noticeText)
			} else {
				new Notice(`Migration failed: ${result.message || "Unknown error"}`)
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			new Notice(`Migration failed: ${errorMessage}`)
		}
	}
}

