import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { MigrationService } from "../services/MigrationService"
import { StateService, type PluginState } from "../services/StateService"
import { CredentialService } from "../services/CredentialService"
import { VaultAnalysisService } from "../services/VaultAnalysisService"
import { getVaultPath, openSettings } from "../utils/obsidianApi"
import type { MigrationProgress } from "../services/MigrationService"
import type { AnalysisProgress } from "../types"
import { DEFAULT_SETTINGS } from "../types"
import {
	createTypeIcon,
	getTypeName,
} from "./helpers/propertyTypeHelpers"
import {
	createSampleColumn,
	createIssueColumn,
} from "./helpers/columnHelpers"

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
	private activeTab: "migration" | "analysis" = "migration"
	private statusContainer: HTMLElement | null = null
	private progressContainer: HTMLElement | null = null
	private resultsContainer: HTMLElement | null = null
	private analysisContainer: HTMLElement | null = null
	private analysisProgressContainer: HTMLElement | null = null
	private controlsContainer: HTMLElement | null = null
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
	private refreshButton: HTMLButtonElement | null = null

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
		contentEl.addClass("graphdb-sync-dashboard-view")

		// Create tabs container
		this.tabsContainer = contentEl.createDiv("graphdb-tabs-container")
		
		// Tab buttons
		this.tabButtonsContainer = this.tabsContainer.createDiv("graphdb-tab-buttons")
		const migrationTabBtn = this.tabButtonsContainer.createEl("button", {
			text: "Migration",
			cls: "graphdb-tab-button graphdb-tab-button-active",
		})
		migrationTabBtn.setAttribute("data-tab", "migration")
		migrationTabBtn.addEventListener("click", () => {
			this.switchTab("migration")
		})

		const analysisTabBtn = this.tabButtonsContainer.createEl("button", {
			text: "Analysis",
			cls: "graphdb-tab-button",
		})
		analysisTabBtn.setAttribute("data-tab", "analysis")
		analysisTabBtn.addEventListener("click", () => {
			this.switchTab("analysis")
		})

		// Tab content container
		this.tabContentContainer = this.tabsContainer.createDiv("graphdb-tab-content")

		// Migration tab content
		this.migrationTabContent = this.tabContentContainer.createDiv(
			"graphdb-tab-pane graphdb-tab-pane-active"
		)
		this.migrationTabContent.setAttribute("data-tab", "migration")

		// Status section
		this.statusContainer = this.migrationTabContent.createDiv("graphdb-status-section")
		this.updateStatus()

		// Progress section
		this.progressContainer = this.migrationTabContent.createDiv("graphdb-progress-section")
		this.updateProgress(null)

		// Results section
		this.resultsContainer = this.migrationTabContent.createDiv("graphdb-results-section")
		this.updateResults()

		// Controls section
		this.controlsContainer = this.migrationTabContent.createDiv("graphdb-controls-section")
		// Controls will be created by subscription callback to ensure latest state

		// Analysis tab content
		this.analysisTabContent = this.tabContentContainer.createDiv("graphdb-tab-pane")
		this.analysisTabContent.setAttribute("data-tab", "analysis")

		// Analysis progress section
		this.analysisProgressContainer = this.analysisTabContent.createDiv(
			"graphdb-analysis-progress-section"
		)
		this.updateAnalysisProgress(null)

		// Analysis section
		this.analysisContainer = this.analysisTabContent.createDiv("graphdb-analysis-section")
		this.updateAnalysis()
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
	 * Updates the analysis progress display
	 */
	updateAnalysisProgress(progress: AnalysisProgress | null): void {
		if (!this.analysisProgressContainer) return

		this.analysisProgressContainer.empty()

		if (!progress) {
			return
		}

		this.currentAnalysisProgress = progress

		const progressEl = this.analysisProgressContainer.createDiv(
			"graphdb-analysis-progress"
		)

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
		} else if (progress.status === "analyzing") {
			progressText.setText(
				`Analyzing: ${progress.current}/${progress.total} files${
					progress.currentFile ? ` - ${progress.currentFile}` : ""
				}`
			)
		} else if (progress.status === "complete") {
			progressText.setText("Analysis complete")
		}
	}

	/**
	 * Updates the analysis results display
	 */
	updateAnalysis(): void {
		if (!this.analysisContainer) return

		this.analysisContainer.empty()

		const lastResult = this.plugin.settings.lastAnalysisResult
		if (!lastResult) {
			const noResultsEl = this.analysisContainer.createDiv(
				"graphdb-analysis-empty"
			)
			noResultsEl.setText("No analysis results yet. Analysis will run automatically when the plugin is ready.")
			return
		}

		const analysisEl = this.analysisContainer.createDiv("graphdb-analysis")

		// Analysis header with refresh button
		const header = analysisEl.createDiv("graphdb-analysis-header")
		const headerContent = header.createDiv("graphdb-analysis-header-content")
		headerContent.createSpan({
			text: "Front matter analysis",
			cls: "graphdb-analysis-title",
		})

		// Refresh button with icon
		this.refreshButton = header.createEl("button", {
			cls: "mod-cta graphdb-refresh-button",
			attr: {
				"aria-label": "Refresh analysis",
			},
		})
		this.refreshButton.disabled = this.isAnalyzing
		const refreshIconEl = this.refreshButton.createSpan()
		setIcon(refreshIconEl, "rotate-cw")
		this.refreshButton.addEventListener("click", async (evt) => {
			evt.preventDefault()
			evt.stopPropagation()
			await this.startAnalysis()
		})

		// Last run time (prominent)
		const lastRunEl = analysisEl.createDiv("graphdb-analysis-last-run")
		const timestamp = new Date(lastResult.analysisDate)
		lastRunEl.createSpan({
			text: `Last analyzed: ${timestamp.toLocaleString()}`,
			cls: "graphdb-analysis-last-run-text",
		})

		// Analysis stats
		const stats = analysisEl.createDiv("graphdb-analysis-stats")
		stats.createDiv({
			text: `Total files: ${lastResult.totalFiles}`,
		})
		stats.createDiv({
			text: `Files with front matter: ${lastResult.filesWithFrontMatter}`,
		})
		stats.createDiv({
			text: `Properties found: ${lastResult.properties.length}`,
		})

		// All properties as cards (sorted by frequency)
		const sortedProperties = [...lastResult.properties].sort(
			(a, b) => b.frequency - a.frequency
		)

		if (sortedProperties.length > 0) {
			const propertiesEl = analysisEl.createDiv("graphdb-analysis-properties")
			propertiesEl.createDiv({
				text: `Properties (${sortedProperties.length}):`,
				cls: "graphdb-analysis-properties-title",
			})

			sortedProperties.forEach((prop) => {
				// Determine warning level for border color (use warning for both inconsistent and non-existent)
				let warningLevel: "warning" | "none" = "none"
				if (prop.validation?.isFileProperty) {
					if (
						prop.validation.inconsistentPattern ||
						prop.validation.nonExistentFiles > 0
					) {
						warningLevel = "warning"
					}
				}

				const propertyCard = propertiesEl.createDiv(
					"graphdb-analysis-property-card"
				)
				
				// Set border color based on warning level
				if (warningLevel === "warning") {
					propertyCard.addClass("graphdb-analysis-property-card-warning")
				}

				const cardHeader = propertyCard.createDiv(
					"graphdb-analysis-property-card-header"
				)
				
				// Type icon (left of name)
				createTypeIcon(
					cardHeader,
					prop.type,
					prop.isArray,
					prop.arrayItemType,
					prop.validation?.isFileProperty,
					prop.validation?.isMultiFile
				)
				
				// Property name
				cardHeader.createSpan({
					text: prop.name,
					cls: "graphdb-analysis-property-card-name",
				})
				
				// Pattern (right of name)
				cardHeader.createSpan({
					text: prop.isArray
						? prop.arrayItemPattern || "mixed"
						: prop.valuePattern,
					cls: "graphdb-analysis-property-card-pattern",
				})
				
				if (prop.validation?.isMultiFile) {
					cardHeader.createSpan({
						text: "(multi-file)",
						cls: "graphdb-analysis-property-card-badge",
					})
				}
				
				// Frequency section (right side)
				const frequencySection = cardHeader.createDiv(
					"graphdb-analysis-property-card-frequency-section"
				)
				frequencySection.createSpan({
					text: getTypeName(
						prop.type,
						prop.isArray,
						prop.arrayItemType
					),
					cls: "graphdb-analysis-property-card-type-name",
				})
				frequencySection.createSpan({
					text: `${prop.frequency} files (${prop.frequencyPercent.toFixed(1)}%)`,
					cls: "graphdb-analysis-property-card-frequency",
				})

				const cardBody = propertyCard.createDiv(
					"graphdb-analysis-property-card-body"
				)

				// Validation information (if file property)
				const hasValidationIssues =
					prop.validation?.isFileProperty &&
					(prop.validation.inconsistentPattern ||
						prop.validation.invalidWikilinks > 0 ||
						prop.validation.nonExistentFiles > 0)

				const hasSampleValues = prop.sampleValues.length > 0
				const hasIssuesToShow =
					hasValidationIssues &&
					prop.validation &&
					prop.validation.validationDetails.length > 0

				// Determine if there are inconsistent or non-existent samples
				// Inconsistent: sample values that are not wikilinks (from validation)
				const inconsistentSamples =
					prop.validation?.inconsistentSamples || []
				
				// Invalid wikilinks: malformed wikilinks
				const invalidWikilinkSamples =
					prop.validation?.validationDetails.filter(
						(d) => d.validation.isWikilink && !d.validation.isValid
					) || []
				
				// Non-existent: wikilinks pointing to files that don't exist
				const nonExistentSamples =
					prop.validation?.validationDetails.filter(
						(d) => d.validation.fileExists === false
					) || []

				// Collapsible section for samples and issues
				if (hasSampleValues || hasIssuesToShow) {
					const collapsibleSection = cardBody.createDiv(
						"graphdb-analysis-property-card-collapsible"
					)
					const collapsibleHeader = collapsibleSection.createDiv(
						"graphdb-analysis-property-card-collapsible-header"
					)
					const toggleIcon = collapsibleHeader.createSpan(
						"graphdb-analysis-property-card-collapsible-icon"
					)
					setIcon(toggleIcon, "chevron-right")
					collapsibleHeader.createSpan({
						text: "Samples & issues",
						cls: "graphdb-analysis-property-card-collapsible-title",
					})

					// Issue icons with counts on the header row
					if (hasValidationIssues && prop.validation) {
						const issuesContainer = collapsibleHeader.createDiv(
							"graphdb-analysis-property-card-header-issues"
						)

						// Invalid wikilinks
						if (prop.validation.invalidWikilinks > 0) {
							const issueItem = issuesContainer.createDiv(
								"graphdb-analysis-property-card-header-issue-item"
							)
							const iconEl = issueItem.createSpan(
								"graphdb-analysis-property-card-header-issue-icon"
							)
							setIcon(iconEl, "alert-circle")
							issueItem.createSpan({
								text: `${prop.validation.invalidWikilinks}`,
								cls: "graphdb-analysis-property-card-header-issue-count",
							})
						}

						// Non-existent files
						if (prop.validation.nonExistentFiles > 0) {
							const issueItem = issuesContainer.createDiv(
								"graphdb-analysis-property-card-header-issue-item"
							)
							const iconEl = issueItem.createSpan(
								"graphdb-analysis-property-card-header-issue-icon"
							)
							setIcon(iconEl, "file-x")
							issueItem.createSpan({
								text: `${prop.validation.nonExistentFiles}`,
								cls: "graphdb-analysis-property-card-header-issue-count",
							})
						}

						// Inconsistent pattern
						if (prop.validation.inconsistentPattern) {
							const issueItem = issuesContainer.createDiv(
								"graphdb-analysis-property-card-header-issue-item"
							)
							const iconEl = issueItem.createSpan(
								"graphdb-analysis-property-card-header-issue-icon graphdb-analysis-property-card-header-issue-icon-warning"
							)
							setIcon(iconEl, "alert-triangle")
							issueItem.createSpan({
								text: `${inconsistentSamples.length}`,
								cls: "graphdb-analysis-property-card-header-issue-count",
							})
						}
					}

					const collapsibleContent = collapsibleSection.createDiv(
						"graphdb-analysis-property-card-collapsible-content"
					)
					collapsibleContent.addClass("graphdb-analysis-property-card-collapsible-hidden")

					const collapsibleGrid = collapsibleContent.createDiv(
						"graphdb-analysis-property-card-collapsible-grid"
					)

					// Sample values column (first)
					if (hasSampleValues) {
						createSampleColumn(collapsibleGrid, prop.sampleValues)
					}

					// Invalid wikilinks examples column
					if (invalidWikilinkSamples.length > 0) {
						createIssueColumn(
							collapsibleGrid,
							"Invalid wikilinks:",
							"alert-circle",
							invalidWikilinkSamples
						)
					}

					// Non-existent files examples column
					if (nonExistentSamples.length > 0) {
						createIssueColumn(
							collapsibleGrid,
							"Non-existent files:",
							"file-x",
							nonExistentSamples
						)
					}

					// Inconsistent samples column
					if (inconsistentSamples.length > 0) {
						createIssueColumn(
							collapsibleGrid,
							"Inconsistent:",
							"alert-triangle",
							inconsistentSamples,
							true
						)
					}

					// Toggle functionality (make entire header clickable)
					let isExpanded = false
					collapsibleHeader.addEventListener("click", () => {
						isExpanded = !isExpanded
						if (isExpanded) {
							collapsibleContent.removeClass(
								"graphdb-analysis-property-card-collapsible-hidden"
							)
							setIcon(toggleIcon, "chevron-down")
						} else {
							collapsibleContent.addClass(
								"graphdb-analysis-property-card-collapsible-hidden"
							)
							setIcon(toggleIcon, "chevron-right")
						}
					})
				} else if (prop.validation?.isFileProperty) {
					// Show valid status if no samples/issues but is file property
					const validationEl = cardBody.createDiv(
						"graphdb-analysis-property-card-validation"
					)
					const validLine = validationEl.createDiv(
						"graphdb-analysis-property-card-validation-line"
					)
					const validIconEl = validLine.createSpan(
						"graphdb-analysis-property-card-icon"
					)
					setIcon(validIconEl, "check-circle")
					validLine.createSpan({
						text: "All wikilinks are valid",
						cls: "graphdb-analysis-property-card-valid",
					})
				}
			})
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
		this.updateRefreshButtonState()
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
			this.updateRefreshButtonState()
		}
	}

	/**
	 * Updates the refresh button disabled state
	 */
	private updateRefreshButtonState(): void {
		if (this.refreshButton) {
			this.refreshButton.disabled = this.isAnalyzing
		}
	}
}

