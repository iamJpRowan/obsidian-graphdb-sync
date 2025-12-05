import { Plugin, WorkspaceLeaf } from "obsidian"
import { SettingsTab } from "./settingsTab"
import { CredentialService } from "./services/CredentialService"
import { MigrationService } from "./services/MigrationService"
import { StateService } from "./services/StateService"
import { StatusBarService } from "./statusBar/StatusBarService"
import {
	DashboardView,
	DASHBOARD_VIEW_TYPE,
} from "./dashboardView/DashboardView"
import { DEFAULT_SETTINGS, type PluginSettings } from "./types"

export const VIEW_TYPE_GRAPHDB_SYNC = DASHBOARD_VIEW_TYPE

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

		// Register view
		this.registerView(
			VIEW_TYPE_GRAPHDB_SYNC,
			(leaf) => new DashboardView(leaf, this)
		)

		// Register command to open status view
		this.addCommand({
			id: "open-migration-status",
			name: "Open sync status",
			callback: () => {
				this.activateViewInternal()
			},
		})

		// Register command to start migration
		this.addCommand({
			id: "start-migration",
			name: "Start migration",
			callback: async () => {
				await this.startMigrationInternal()
			},
		})

		// Register command to open analysis view
		this.addCommand({
			id: "open-analysis-view",
			name: "Open analysis view",
			callback: async () => {
				await this.activateViewInternal()
			},
		})

		// Initial status bar update
		this.statusBarService.update(this.settings)

		// Auto-test connection on load
		StateService.testConnection(this.settings)
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
	}

	async saveSettings() {
		await this.saveData(this.settings)
		// Update state service with new settings
		StateService.updateSettings(this.settings)
	}

	/**
	 * Activates or opens the status view
	 */
	private async activateViewInternal(): Promise<void> {
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
	 * Starts a migration
	 */
	private async startMigrationInternal(): Promise<void> {
		if (MigrationService.isRunning()) {
			return
		}

		// Open view if not already open
		await this.activateViewInternal()

		// Get the view instance and trigger migration
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPHDB_SYNC)
		if (leaves.length > 0) {
			const view = leaves[0].view as DashboardView
			// Call a public method on the view to start migration
			await view.startMigration()
		}
	}


	/**
	 * Public method for status bar service to activate view
	 */
	activateView(): Promise<void> {
		return this.activateViewInternal()
	}

	/**
	 * Public method for status bar service to start migration
	 */
	startMigration(): Promise<void> {
		return this.startMigrationInternal()
	}
}
