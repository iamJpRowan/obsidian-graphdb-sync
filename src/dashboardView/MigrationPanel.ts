import { Notice, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { MigrationService } from "../services/MigrationService"
import { CredentialService } from "../services/CredentialService"
import { StateService } from "../services/StateService"
import { getVaultPath } from "../utils/obsidianApi"
import { DEFAULT_SETTINGS, type MigrationHistoryEntry, type MigrationResult } from "../types"
import { PasswordPrompt } from "./components/PasswordPrompt"
import { MigrationHistoryModal } from "./components/MigrationHistoryModal"
import type { PluginState } from "../services/StateService"

/**
 * Migration panel component
 * Handles full migrations and displays migration status
 */
export class MigrationPanel {
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
		const history = this.plugin.settings.migrationHistory
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
		
		const iconContainer = actionLine.createDiv("graphdb-migration-icon-container")
		const iconButton = iconContainer.createDiv("graphdb-migration-icon-button")
		setIcon(iconButton, "database-backup")
		const buttonText = iconContainer.createSpan("graphdb-migration-icon-text")
		buttonText.setText("Run migration")
		iconContainer.setAttr("aria-label", "Start migration")
		iconContainer.setAttr("role", "button")
		iconContainer.setAttr("tabindex", "0")
		iconContainer.addEventListener("click", () => {
			this.startFullMigration()
		})
		iconContainer.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				this.startFullMigration()
			}
		})
	}

	/**
	 * Subscribes to state changes for real-time updates
	 */
	private subscribeToState(): void {
		this.unsubscribeState = StateService.subscribe("migration", (state: PluginState) => {
			this.onMigrationStateChange(state)
		})
	}

	/**
	 * Handles migration state changes
	 */
	private onMigrationStateChange(state: PluginState): void {
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
		
		// Show progress bar if migration is running
		if (state.running) {
			if (state.paused) {
				const pausedEl = this.statusContainer.createSpan("graphdb-migration-progress-paused")
				pausedEl.setText("⏸ Migration paused")
			} else if (state.cancelled) {
				const cancelledEl = this.statusContainer.createSpan("graphdb-migration-progress-cancelled")
				cancelledEl.setText("✗ Migration cancelled")
			} else if (state.progress) {
				this.renderProgressBar(state.progress)
			} else {
				const startingEl = this.statusContainer.createSpan("graphdb-migration-progress-text")
				startingEl.setText("Starting migration...")
			}
		}
		// Leave empty when idle (status text is shown on action line)
	}

	/**
	 * Renders status text on the action line (next to Run migration button)
	 */
	private renderStatusText(container: HTMLElement): void {
		container.empty()

		const state = StateService.getMigrationStatus()
		
		// Show progress text during migration
		if (state.running && state.progress) {
			const progress = state.progress
			const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
			const statusText = this.getStatusText(progress.status)
			const statusEl = container.createSpan("graphdb-migration-status-text")
			statusEl.setText(`${statusText}: ${progress.current}/${progress.total} (${percentage}%)`)
			return
		}

		// Show last result if available (when idle)
		// Use history if available, otherwise fall back to lastMigrationResult for backward compatibility
		const history = this.plugin.settings.migrationHistory
		const lastResult = history && history.length > 0 
			? history[0] 
			: this.plugin.settings.lastMigrationResult
		
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
	private renderProgressBar(progress: import("../services/MigrationService").MigrationProgress): void {
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
			migrating: "Migrating",
			creating_nodes: "Creating nodes",
			creating_relationships: "Creating relationships",
		}
		return statusMap[status] || status
	}

	/**
	 * Saves migration result to history
	 */
	private async saveMigrationResult(result: MigrationResult): Promise<void> {
		// Initialize history array if it doesn't exist
		if (!this.plugin.settings.migrationHistory) {
			this.plugin.settings.migrationHistory = []
		}

		// Convert MigrationResult to MigrationHistoryEntry
		const historyEntry: MigrationHistoryEntry = {
			id: `migration-${Date.now()}`,
			timestamp: Date.now(),
			success: result.success,
			totalFiles: result.totalFiles,
			successCount: result.successCount,
			errorCount: result.errorCount,
			duration: result.duration,
			message: result.message,
			phasesExecuted: result.phasesExecuted,
			errors: [
				...result.nodeErrors.map(e => ({ file: e.file, error: e.error })),
				...result.relationshipErrors.map(e => ({ file: e.file, property: e.property, target: e.target, error: e.error })),
			],
			relationshipStats: result.relationshipStats,
			// Store detailed data for full view
			nodeErrors: result.nodeErrors,
			relationshipErrors: result.relationshipErrors,
			propertyStats: result.propertyStats,
		}

		// Add to history (most recent first)
		this.plugin.settings.migrationHistory.unshift(historyEntry)

		// Limit history size (keep last 50 migrations)
		const MAX_HISTORY = 50
		if (this.plugin.settings.migrationHistory.length > MAX_HISTORY) {
			this.plugin.settings.migrationHistory = this.plugin.settings.migrationHistory.slice(0, MAX_HISTORY)
		}

		// Update lastMigrationResult for backward compatibility
		this.plugin.settings.lastMigrationResult = {
			success: historyEntry.success,
			totalFiles: historyEntry.totalFiles,
			successCount: historyEntry.successCount,
			errorCount: historyEntry.errorCount,
			errors: historyEntry.errors,
			duration: historyEntry.duration,
			message: historyEntry.message,
			relationshipStats: historyEntry.relationshipStats,
			timestamp: historyEntry.timestamp,
		}

		await this.plugin.saveSettings()
	}

	private async startFullMigration(): Promise<void> {
		if (MigrationService.isRunning()) {
			new Notice("Migration already in progress")
			return
		}

		// Clear old results when starting new migration (status will show progress)
		this.renderStatus()

		// Get password
		let password = CredentialService.getPassword()
		if (!password) {
			password = await PasswordPrompt.prompt(this.plugin)
			if (!password) {
				return
			}
		}

		const uri = this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username = this.plugin.settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		const vaultPath = getVaultPath(this.plugin.app)

		try {
			// Progress updates are handled via StateService subscription
			const result = await MigrationService.migrate(
				vaultPath,
				uri,
				{ username, password },
				() => {
					// Progress updates are handled via StateService subscription
				},
				this.plugin.app,
				this.plugin.settings
			)

			// Save result to history
			this.saveMigrationResult(result)

			// Update display
			this.renderStatus()
			if (this.statusTextContainer) {
				this.renderStatusText(this.statusTextContainer)
			}

			if (result.success) {
				new Notice(`Migration completed: ${result.successCount}/${result.totalFiles} files`)
			} else {
				new Notice(`Migration failed: ${result.message || "Unknown error"}`)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			new Notice(`Migration failed: ${errorMessage}`)
		}
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


