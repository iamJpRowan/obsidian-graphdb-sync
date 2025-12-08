import { ItemView, Notice, WorkspaceLeaf } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { StateService, type PluginState } from "../services/StateService"
import { VaultAnalysisService } from "../services/VaultAnalysisService"
import type { MigrationProgress } from "../services/MigrationService"
import type { AnalysisProgress } from "../types"
import { MigrationTab } from "./components/MigrationTab"
import { ConfigurationTab } from "./components/ConfigurationTab"

export const DASHBOARD_VIEW_TYPE = "graphdb-sync-dashboard"

/**
 * View for displaying migration status and results
 */
export class DashboardView extends ItemView {
	plugin: GraphDBSyncPlugin
	private tabsContainer: HTMLElement | null = null
	private tabButtonsContainer: HTMLElement | null = null
	private tabContentContainer: HTMLElement | null = null
	private migrationTabContent: HTMLElement | null = null
	private analysisTabContent: HTMLElement | null = null
	private activeTab: "migration" | "analysis" = "analysis"
	private unsubscribeState: (() => void) | null = null
	private lastMigrationState: {
		running: boolean
		paused: boolean
		cancelled: boolean
	} | null = null
	private lastIsReady: boolean | null = null
	private isAnalyzing: boolean = false
	private currentAnalysisProgress: AnalysisProgress | null = null
	private hasRunInitialAnalysis: boolean = false
	private migrationTab: MigrationTab | null = null
	private configurationTab: ConfigurationTab | null = null

	constructor(leaf: WorkspaceLeaf, plugin: GraphDBSyncPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE
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
				
				// Auto-run analysis when plugin is ready (only once, on initial view open)
				if (state.isReady && !this.hasRunInitialAnalysis) {
					this.hasRunInitialAnalysis = true
					// Run analysis in background (don't await)
					this.startAnalysis().catch(() => {
						// Silently fail - analysis will be available on next open
					})
				}
				
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
				this.updateStatus()
			}
		})
	}

	async onClose(): Promise<void> {
		// Unsubscribe from state changes
		if (this.unsubscribeState) {
			this.unsubscribeState()
			this.unsubscribeState = null
		}

		// Cleanup tabs
		if (this.configurationTab) {
			this.configurationTab.destroy()
			this.configurationTab = null
		}
	}

	/**
	 * Renders the view content
	 */
	private render(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-sync-dashboard-view")

		// Create tabs container
		this.tabsContainer = contentEl.createDiv("graphdb-tabs-container")
		
		// Tab buttons
		this.tabButtonsContainer = this.tabsContainer.createDiv("graphdb-tab-buttons")
		const migrationTabBtn = this.tabButtonsContainer.createEl("button", {
			text: "Migration",
			cls: "graphdb-tab-button",
		})
		migrationTabBtn.setAttribute("data-tab", "migration")
		migrationTabBtn.addEventListener("click", () => {
			this.switchTab("migration")
		})

		const analysisTabBtn = this.tabButtonsContainer.createEl("button", {
			text: "Configuration",
			cls: "graphdb-tab-button graphdb-tab-button-active",
		})
		analysisTabBtn.setAttribute("data-tab", "analysis")
		analysisTabBtn.addEventListener("click", () => {
			this.switchTab("analysis")
		})

		// Tab content container
		this.tabContentContainer = this.tabsContainer.createDiv("graphdb-tab-content")

		// Migration tab content
		this.migrationTabContent = this.tabContentContainer.createDiv(
			"graphdb-tab-pane"
		)
		this.migrationTabContent.setAttribute("data-tab", "migration")
		this.migrationTab = new MigrationTab(this.migrationTabContent, this.plugin, this.app)
		this.migrationTab.render()

		// Analysis tab content (Configuration tab - active by default)
		this.analysisTabContent = this.tabContentContainer.createDiv(
			"graphdb-tab-pane graphdb-tab-pane-active"
		)
		this.analysisTabContent.setAttribute("data-tab", "analysis")
		this.configurationTab = new ConfigurationTab(this.analysisTabContent, this.plugin)
		this.configurationTab.render()
		this.configurationTab.setRefreshButtonHandler(() => this.startAnalysis())
	}

	/**
	 * Switches between tabs
	 */
	private switchTab(tab: "migration" | "analysis"): void {
		this.activeTab = tab

		// Update tab buttons
		if (this.tabButtonsContainer) {
			const buttons = this.tabButtonsContainer.querySelectorAll(".graphdb-tab-button")
			buttons.forEach((btn) => {
				if (btn.getAttribute("data-tab") === tab) {
					btn.addClass("graphdb-tab-button-active")
				} else {
					btn.removeClass("graphdb-tab-button-active")
				}
			})
		}

		// Update tab panes
		if (this.tabContentContainer) {
			const panes = this.tabContentContainer.querySelectorAll(".graphdb-tab-pane")
			panes.forEach((pane) => {
				if (pane.getAttribute("data-tab") === tab) {
					pane.addClass("graphdb-tab-pane-active")
				} else {
					pane.removeClass("graphdb-tab-pane-active")
				}
			})
		}
	}

	/**
	 * Updates the status display (delegates to MigrationTab)
	 */
	updateStatus(): void {
		if (this.migrationTab) {
			this.migrationTab.updateStatus()
		}
	}

	/**
	 * Updates the progress display (delegates to MigrationTab)
	 */
	updateProgress(progress: MigrationProgress | null): void {
		if (this.migrationTab) {
			this.migrationTab.updateProgress(progress)
		}
	}

	/**
	 * Updates the results display (delegates to MigrationTab)
	 */
	updateResults(): void {
		if (this.migrationTab) {
			this.migrationTab.updateResults()
		}
	}

	/**
	 * Updates the controls display (delegates to MigrationTab)
	 */
	updateControls(): void {
		if (this.migrationTab) {
			this.migrationTab.updateControls()
		}
	}

	/**
	 * Starts a migration (delegates to MigrationTab)
	 */
	async startMigration(): Promise<void> {
		if (this.migrationTab) {
			await this.migrationTab.startMigration()
		}
	}

	/**
	 * Updates the analysis progress display (delegates to ConfigurationTab)
	 */
	updateAnalysisProgress(progress: AnalysisProgress | null): void {
		if (this.configurationTab) {
			this.configurationTab.updateAnalysisProgress(progress)
		}
	}

	/**
	 * Updates the analysis results display (delegates to ConfigurationTab)
	 */
	updateAnalysis(): void {
		if (this.configurationTab) {
			this.configurationTab.updateAnalysis()
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
		this.updateAnalysis()
		this.updateAnalysisProgress(this.currentAnalysisProgress)
		this.updateControls()
	}

	/**
	 * Public method to start analysis (for external calls)
	 */
	async startAnalysis(): Promise<void> {
		if (this.isAnalyzing) {
			new Notice("Analysis already in progress")
			return
		}

		this.isAnalyzing = true
		if (this.configurationTab) {
			this.configurationTab.updateRefreshButtonState(true)
		}
		this.updateAnalysis() // Update to show progress

		try {
			const result = await VaultAnalysisService.analyze(
				this.app,
				(progress) => {
					this.currentAnalysisProgress = progress
					this.updateAnalysisProgress(progress)
				}
			)

			// Save result to settings
			this.plugin.settings.lastAnalysisResult = result
			await this.plugin.saveSettings()

			// Update display
			this.updateAnalysis()
			this.updateAnalysisProgress(null)

			new Notice(
				`Analysis complete: ${result.properties.length} properties found in ${result.filesWithFrontMatter} files`
			)
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			new Notice(`Analysis failed: ${errorMessage}`)
			this.updateAnalysisProgress(null)
			this.updateAnalysis()
		} finally {
			this.isAnalyzing = false
			this.currentAnalysisProgress = null
			if (this.configurationTab) {
				this.configurationTab.updateRefreshButtonState(false)
			}
		}
	}

}

