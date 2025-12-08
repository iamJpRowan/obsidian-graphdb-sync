import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import type { AnalysisProgress } from "../../types"
import { PropertyCard } from "./PropertyCard"

/**
 * Configuration tab component for displaying property analysis and configuration
 */
export class ConfigurationTab {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private progressContainer: HTMLElement | null = null
	private analysisContainer: HTMLElement | null = null
	private refreshButton: HTMLButtonElement | null = null
	private propertyCards: PropertyCard[] = []
	private propertyMappingDebounceTimers: Map<string, NodeJS.Timeout> = new Map()

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin) {
		this.container = container
		this.plugin = plugin
	}

	/**
	 * Renders the configuration tab
	 */
	render(): void {
		this.container.empty()

		// Analysis progress section
		this.progressContainer = this.container.createDiv(
			"graphdb-analysis-progress-section"
		)
		this.updateAnalysisProgress(null)

		// Analysis section
		this.analysisContainer = this.container.createDiv("graphdb-analysis-section")
		this.updateAnalysis()
	}

	/**
	 * Updates the analysis progress display
	 */
	updateAnalysisProgress(progress: AnalysisProgress | null): void {
		if (!this.progressContainer) return

		this.progressContainer.empty()

		if (!progress) {
			return
		}

		const progressEl = this.progressContainer.createDiv(
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

		// Cleanup existing property cards
		this.propertyCards.forEach((card) => card.destroy())
		this.propertyCards = []

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
		const refreshIconEl = this.refreshButton.createSpan()
		setIcon(refreshIconEl, "rotate-cw")

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
				const propertyCard = new PropertyCard(
					propertiesEl,
					this.plugin,
					prop,
					(propertyName, timer) => {
						this.propertyMappingDebounceTimers.set(propertyName, timer)
					},
					(propertyName) => {
						this.propertyMappingDebounceTimers.delete(propertyName)
					}
				)
				this.propertyCards.push(propertyCard)
			})
		}
	}

	/**
	 * Updates the refresh button disabled state
	 */
	updateRefreshButtonState(isAnalyzing: boolean): void {
		if (this.refreshButton) {
			this.refreshButton.disabled = isAnalyzing
		}
	}

	/**
	 * Sets the refresh button click handler
	 */
	setRefreshButtonHandler(handler: () => Promise<void>): void {
		if (this.refreshButton) {
			this.refreshButton.addEventListener("click", async (evt) => {
				evt.preventDefault()
				evt.stopPropagation()
				await handler()
			})
		}
	}

	/**
	 * Cleanup method
	 */
	destroy(): void {
		// Cleanup all property cards
		this.propertyCards.forEach((card) => card.destroy())
		this.propertyCards = []

		// Clear all debounce timers
		this.propertyMappingDebounceTimers.forEach((timer) => {
			clearTimeout(timer)
		})
		this.propertyMappingDebounceTimers.clear()
	}
}

