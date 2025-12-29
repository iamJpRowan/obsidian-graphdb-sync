import { Plugin, WorkspaceLeaf } from "obsidian"
import { CredentialService } from "./services/CredentialService"
import { StateService } from "./services/StateService"
import { StatusBarService } from "./statusBar/StatusBarService"
import {
	DashboardViewV2,
	DASHBOARD_VIEW_TYPE_V2,
} from "./dashboardView/DashboardView"
import { SettingsTab } from "./settingsTab"
import { DEFAULT_SETTINGS, type PluginSettings } from "./types"

export const VIEW_TYPE_GRAPHDB_SYNC = DASHBOARD_VIEW_TYPE_V2

export default class GraphDBSyncPlugin extends Plugin {
	settings: PluginSettings
	private statusBarService: StatusBarService
	private unsubscribeState: (() => void) | null = null

	async onload() {
		await this.loadSettings()

		// Initialize state service
		StateService.initialize(this.settings)

		// Initialize status bar service
		this.statusBarService = new StatusBarService()
		this.statusBarService.setup(this)

		// Subscribe to state changes for status bar updates
		this.unsubscribeState = StateService.subscribe("all", () => {
			this.statusBarService.update(this.settings)
		})

		// Register settings tab
		this.addSettingTab(new SettingsTab(this))

		// Register dashboard view
		this.registerView(
			VIEW_TYPE_GRAPHDB_SYNC,
			(leaf) => new DashboardViewV2(leaf, this)
		)

		// Register command to open dashboard
		this.addCommand({
			id: "open-dashboard",
			name: "Open sync dashboard",
			callback: async () => {
				await this.activateView()
			},
		})

		// Initial status bar update
		this.statusBarService.update(this.settings)
	}

	onunload() {
		// Unsubscribe from state changes
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}

		// Clear session password from memory on plugin unload
		CredentialService.clearSessionPassword()

		// Cleanup status bar
		this.statusBarService.cleanup()
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		// Migrate existing lastMigrationResult to history for backward compatibility
		this.migrateLastMigrationResultToHistory()
	}

	/**
	 * Migrates existing lastMigrationResult to migrationHistory for backward compatibility
	 */
	private migrateLastMigrationResultToHistory(): void {
		// If history doesn't exist but lastMigrationResult does, migrate it
		if (!this.settings.migrationHistory && this.settings.lastMigrationResult) {
			const lastResult = this.settings.lastMigrationResult
			// Convert to MigrationHistoryEntry format
			this.settings.migrationHistory = [{
				id: `migration-${lastResult.timestamp}`,
				timestamp: lastResult.timestamp,
				success: lastResult.success,
				totalFiles: lastResult.totalFiles,
				successCount: lastResult.successCount,
				errorCount: lastResult.errorCount,
				duration: lastResult.duration,
				message: lastResult.message,
				phasesExecuted: ["nodes"], // Default, we don't have this info in old format
				errors: lastResult.errors,
				relationshipStats: lastResult.relationshipStats,
			}]
			// Keep lastMigrationResult for backward compatibility
		}
	}

	async saveSettings() {
		await this.saveData(this.settings)
		// Update state service with new settings
		StateService.updateSettings(this.settings)
	}

	/**
	 * Activates or opens the dashboard view
	 */
	private async activateView(): Promise<void> {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_GRAPHDB_SYNC)

		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			const rightLeaf = workspace.getRightLeaf(false)
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_GRAPHDB_SYNC,
					active: true,
				})
				leaf = rightLeaf
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf)
		}
	}

	/**
	 * Public method for status bar service to activate view
	 */
	activateViewPublic(): Promise<void> {
		return this.activateView()
	}

	/**
	 * Public method for status bar service to start migration
	 */
	startMigration(): Promise<void> {
		// Migration is now handled within the dashboard view
		// Just open the view
		return this.activateView()
	}
}
