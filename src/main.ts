import { Plugin, WorkspaceLeaf } from "obsidian"
import { CredentialService } from "./services/CredentialService"
import { StateService } from "./services/StateService"
import { SyncQueueService } from "./services/SyncQueueService"
import { StatusBarService } from "./statusBar/StatusBarService"
import {
	ConfigurationPanel,
	CONFIGURATION_PANEL_VIEW_TYPE,
} from "./configurationPanel"
import { SettingsTab } from "./settingsTab"
import { DEFAULT_SETTINGS, type PluginSettings } from "./types"

export const VIEW_TYPE_GRAPHDB_SYNC = CONFIGURATION_PANEL_VIEW_TYPE

export default class GraphDBSyncPlugin extends Plugin {
	settings: PluginSettings
	private statusBarService: StatusBarService
	private unsubscribeState: (() => void) | null = null

	async onload() {
		await this.loadSettings()

		// Initialize state service
		StateService.initialize(this.settings)

		// Initialize sync queue service
		SyncQueueService.initialize(this)

		// Initialize status bar service
		this.statusBarService = new StatusBarService()
		this.statusBarService.setup(this)

		// Subscribe to state changes for status bar updates
		this.unsubscribeState = StateService.subscribe("all", () => {
			this.statusBarService.update(this.settings)
		})

		// Register settings tab
		this.addSettingTab(new SettingsTab(this))

		// Register configuration panel view
		this.registerView(
			VIEW_TYPE_GRAPHDB_SYNC,
			(leaf) => new ConfigurationPanel(leaf, this)
		)

		// Register command to open configuration panel
		this.addCommand({
			id: "open-configuration-panel",
			name: "Open configuration panel",
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
	}

	async saveSettings() {
		await this.saveData(this.settings)
		// Update state service with new settings
		StateService.updateSettings(this.settings)
	}

	/**
	 * Activates or opens the configuration panel view
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
		// Migration is now handled within the configuration panel view
		// Just open the view
		return this.activateView()
	}
}
