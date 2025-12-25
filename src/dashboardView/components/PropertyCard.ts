import { setIcon, Setting, Component } from "obsidian"
import type GraphDBSyncPlugin from "../../main"
import type {
	PropertyStats,
	PropertyMapping,
	RelationshipMappingConfig,
	PropertyErrorStats,
} from "../../types"
import { getPropertyMapping } from "../../utils/propertyMappingHelpers"
import { createTypeIcon, getTypeName } from "../helpers/propertyTypeHelpers"
import { createSampleColumn, createIssueColumn } from "../helpers/columnHelpers"
import {
	createMappingTypeRow,
	createRelationshipField,
	createNodePropertyField,
} from "../helpers/formHelpers"
import { createRelationshipConfig } from "../helpers/configHelpers"

/**
 * Property card component for displaying and configuring property mappings
 */
export class PropertyCard {
	private plugin: GraphDBSyncPlugin
	private prop: PropertyStats
	private propertyCard: HTMLElement
	private mapping: PropertyMapping
	private relationshipField: ReturnType<typeof createRelationshipField> | null = null
	private nodePropertyField: ReturnType<typeof createNodePropertyField> | null = null
	private toggleComponent: { setValue: (value: boolean) => void; setDisabled: (disabled: boolean) => void } | null = null
	private enableSetting: Setting
	private cardHeader: HTMLElement
	private cardBody: HTMLElement
	private expandCollapseIcon: HTMLElement
	private isExpanded: boolean = false
	private debounceTimer: NodeJS.Timeout | null = null
	private setDebounceTimer: ((timer: NodeJS.Timeout) => void) | null = null
	private clearDebounceTimer: (() => void) | null = null
	private errorSection: HTMLElement | null = null
	private errorSectionExpanded: boolean = false
	private component: Component

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		prop: PropertyStats,
		onDebounceTimerSet: (propertyName: string, timer: NodeJS.Timeout) => void,
		onDebounceTimerClear: (propertyName: string) => void
	) {
		this.plugin = plugin
		this.prop = prop
		this.propertyCard = container.createDiv("graphdb-analysis-property-card")
		this.component = new Component()
		this.component.load()
		this.setupMapping()
		this.render(onDebounceTimerSet, onDebounceTimerClear)
	}

	/**
	 * Initialize mapping from settings or create default
	 */
	private setupMapping(): void {
		const existingMapping = getPropertyMapping(this.plugin.settings, this.prop.name)
		this.mapping = existingMapping || {
			propertyName: this.prop.name,
			mappingType: undefined,
			config: undefined,
			enabled: false,
		}
	}

	/**
	 * Renders the property card
	 */
	private render(
		onDebounceTimerSet: (propertyName: string, timer: NodeJS.Timeout) => void,
		onDebounceTimerClear: (propertyName: string) => void
	): void {
		// Determine warning level for border color
		let warningLevel: "warning" | "none" = "none"
		if (this.prop.validation?.isFileProperty) {
			if (
				this.prop.validation.inconsistentPattern ||
				this.prop.validation.nonExistentFiles > 0
			) {
				warningLevel = "warning"
			}
		}

		if (warningLevel === "warning") {
			this.propertyCard.addClass("graphdb-analysis-property-card-warning")
		}

		this.cardHeader = this.propertyCard.createDiv(
			"graphdb-analysis-property-card-header"
		)

		// Validation information (if file property) - defined early for reuse
		const hasValidationIssues: boolean =
			!!(this.prop.validation?.isFileProperty &&
			(this.prop.validation.inconsistentPattern ||
				this.prop.validation.invalidWikilinks > 0 ||
				this.prop.validation.nonExistentFiles > 0))

		this.renderMetadataRow(hasValidationIssues)
		this.renderHeaderRow()
		this.renderStatusIndicator()
		this.renderPreview()
		this.renderCardBody(onDebounceTimerSet, onDebounceTimerClear)
		this.renderErrorSection()
	}

	/**
	 * Renders the metadata row (top row, always visible)
	 */
	private renderMetadataRow(hasValidationIssues: boolean): void {
		const metadataRow = this.cardHeader.createDiv(
			"graphdb-analysis-property-card-metadata-row"
		)

		// Field type and pattern
		metadataRow.createSpan({
			text: getTypeName(
				this.prop.type,
				this.prop.isArray,
				this.prop.arrayItemType
			),
			cls: "graphdb-analysis-property-card-metadata-item",
		})

		// Pattern
		metadataRow.createSpan({
			text: this.prop.isArray
				? this.prop.arrayItemPattern || "mixed"
				: this.prop.valuePattern,
			cls: "graphdb-analysis-property-card-metadata-item",
		})

		// Multi-file badge
		if (this.prop.validation?.isMultiFile) {
			metadataRow.createSpan({
				text: "(multi-file)",
				cls: "graphdb-analysis-property-card-metadata-item graphdb-analysis-property-card-badge",
			})
		}

		// File count container (to group issue icon and count together)
		const fileCountContainer = metadataRow.createDiv(
			"graphdb-analysis-property-card-metadata-count-container"
		)

		// Validation issues icon - left of file count
		if (hasValidationIssues && this.prop.validation) {
			const issuesIconContainer = fileCountContainer.createDiv(
				"graphdb-analysis-property-card-metadata-issues"
			)
			const issuesIcon = issuesIconContainer.createSpan(
				"graphdb-analysis-property-card-metadata-issues-icon"
			)
			setIcon(issuesIcon, "alert-triangle")
		}

		// File count
		fileCountContainer.createSpan({
			text: `${this.prop.frequency} files`,
			cls: "graphdb-analysis-property-card-metadata-item graphdb-analysis-property-card-metadata-count",
		})
	}

	/**
	 * Renders the header row (property name, toggle, etc.)
	 */
	private renderHeaderRow(): void {
		const headerRow = this.cardHeader.createDiv(
			"graphdb-analysis-property-card-header-row"
		)

		// Left side: Type icon and property name
		const leftSection = headerRow.createDiv(
			"graphdb-analysis-property-card-header-left"
		)

		// Type icon (left of name)
		createTypeIcon(
			leftSection,
			this.prop.type,
			this.prop.isArray,
			this.prop.arrayItemType,
			this.prop.validation?.isFileProperty ?? false,
			this.prop.validation?.isMultiFile ?? false
		)

		// Property name
		leftSection.createSpan({
			text: this.prop.name,
			cls: "graphdb-analysis-property-card-name",
		})

		// Expand/collapse icon (visual indicator in left section)
		this.expandCollapseIcon = leftSection.createSpan(
			"graphdb-analysis-property-card-expand-icon"
		)
		setIcon(this.expandCollapseIcon, "chevron-right")

		// Right side: Enable toggle
		const rightSection = headerRow.createDiv(
			"graphdb-analysis-property-card-header-right"
		)

		this.renderEnableToggle(rightSection)
		this.setupHeaderClickHandler(headerRow)
	}

	/**
	 * Renders the enable toggle
	 */
	private renderEnableToggle(container: HTMLElement): void {
		const enableToggleContainer = container.createDiv(
			"graphdb-analysis-property-card-enable-toggle"
		)
		this.enableSetting = new Setting(enableToggleContainer).setName("")

		// Hide the label and adjust styling
		this.enableSetting.settingEl.classList.add("graphdb-enable-toggle-compact")
		const settingInfo = this.enableSetting.settingEl.querySelector(".setting-item-info")
		if (settingInfo) {
			settingInfo.remove()
		}
		const settingControl = this.enableSetting.settingEl.querySelector(".setting-item-control")
		if (settingControl) {
			settingControl.classList.add("graphdb-enable-toggle-control")
		}

		// Add toggle
		this.enableSetting.addToggle((toggle) => {
			this.toggleComponent = toggle
			const hasMappingType = this.mapping.mappingType !== undefined
			toggle.setValue(this.mapping.enabled)
			toggle.setDisabled(!hasMappingType)

			if (!hasMappingType) {
				this.enableSetting.settingEl.setAttribute("title", "Configure a mapping type to enable")
				this.enableSetting.settingEl.classList.add("graphdb-enable-toggle-disabled")
			}

			toggle.onChange(async (value) => {
				if (this.mapping.mappingType === undefined) {
					toggle.setValue(false)
					return
				}
				this.mapping.enabled = value
				this.debouncedSave()
				this.updateMappingUIState()
			})
		})
	}

	/**
	 * Sets up header click handler for expand/collapse
	 */
	private setupHeaderClickHandler(headerRow: HTMLElement): void {
		headerRow.addEventListener("click", (e: MouseEvent) => {
			const target = e.target as HTMLElement
			if (
				target.closest(".setting-item") ||
				target.closest(".graphdb-analysis-property-card-metadata-issues") ||
				target.closest(".graphdb-analysis-property-card-enable-toggle") ||
				target.closest(".graphdb-config-toggle") ||
				target.closest("input") ||
				target.closest("select") ||
				target.closest("button")
			) {
				return
			}

			this.isExpanded = !this.isExpanded
			if (this.isExpanded) {
				this.cardBody.removeClass("graphdb-analysis-property-card-body-hidden")
				setIcon(this.expandCollapseIcon, "chevron-down")
			} else {
				this.cardBody.addClass("graphdb-analysis-property-card-body-hidden")
				setIcon(this.expandCollapseIcon, "chevron-right")
			}
		})

		headerRow.addClass("graphdb-analysis-property-card-header-clickable")
	}

	/**
	 * Renders the relationship preview in header
	 */
	private renderPreview(): void {
		const previewText = this.getRelationshipPreviewText()
		if (previewText) {
			const previewRow = this.cardHeader.createDiv("graphdb-analysis-property-card-preview-row-header")
			previewRow.createSpan({
				text: previewText,
				cls: "graphdb-analysis-property-card-preview",
			})
		}
	}

	/**
	 * Gets relationship preview text for header
	 */
	private getRelationshipPreviewText(): string | null {
		if (
			this.mapping.mappingType === "relationship" &&
			this.mapping.config &&
			"relationshipType" in this.mapping.config
		) {
			const relConfig = this.mapping.config as RelationshipMappingConfig
			if (relConfig.relationshipType) {
				if (relConfig.direction === "outgoing") {
					return `(source file)-[${relConfig.relationshipType}]->(${this.prop.name})`
				} else {
					return `(${this.prop.name})-[${relConfig.relationshipType}]->(source file)`
				}
			}
		}
		return null
	}

	/**
	 * Updates preview display in header
	 */
	private updatePreviewDisplay(previewText: string | null): void {
		const existingPreviewRow = this.cardHeader.querySelector(".graphdb-analysis-property-card-preview-row-header")
		if (previewText) {
			if (existingPreviewRow) {
				const existingPreview = existingPreviewRow.querySelector(".graphdb-analysis-property-card-preview")
				if (existingPreview) {
					existingPreview.textContent = previewText
				}
			} else {
				const previewRow = this.cardHeader.createDiv("graphdb-analysis-property-card-preview-row-header")
				previewRow.createSpan({
					text: previewText,
					cls: "graphdb-analysis-property-card-preview",
				})
			}
		} else if (existingPreviewRow) {
			existingPreviewRow.remove()
		}
	}

	/**
	 * Renders the card body (collapsible content)
	 */
	private renderCardBody(
		onDebounceTimerSet: (propertyName: string, timer: NodeJS.Timeout) => void,
		onDebounceTimerClear: (propertyName: string) => void
	): void {
		this.cardBody = this.propertyCard.createDiv(
			"graphdb-analysis-property-card-body"
		)
		this.cardBody.addClass("graphdb-analysis-property-card-body-hidden")

		// Store debounce timer callbacks for use in save functions
		this.setDebounceTimer = (timer: NodeJS.Timeout) => {
			onDebounceTimerSet(this.prop.name, timer)
		}
		this.clearDebounceTimer = () => {
			onDebounceTimerClear(this.prop.name)
		}

		// Configuration form section
		const configSection = this.cardBody.createDiv(
			"graphdb-analysis-property-card-config-section"
		)

		// Create mapping type row
		createMappingTypeRow(configSection, this.mapping, async (updatedMapping) => {
			if (updatedMapping.mappingType === undefined) {
				// Remove relationship field if it exists
				this.cleanupRelationshipField()
				this.mapping.config = undefined
				// Immediately remove from settings and save
				await this.saveMapping(true)
				this.refreshMappingFromSettings()
			} else {
				// For non-None selections, use debounced save
				this.debouncedSave()
			}
			this.updateMappingUIState()
		})

		// Initial visibility setup
		this.updateConfigFormVisibility()
		this.updateEnableToggleState()

		// Samples & issues section
		this.renderSamplesSection()
	}

	/**
	 * Renders samples and issues section
	 */
	private renderSamplesSection(): void {
		const hasSampleValues = this.prop.sampleValues.length > 0
		const hasValidationIssues =
			this.prop.validation?.isFileProperty &&
			this.prop.validation &&
			this.prop.validation.validationDetails.length > 0
		const hasIssuesToShow =
			hasValidationIssues &&
			this.prop.validation &&
			this.prop.validation.validationDetails.length > 0

		if (!hasSampleValues && !hasIssuesToShow) {
			if (this.prop.validation?.isFileProperty) {
				// Show valid status if no samples/issues but is file property
				const validationEl = this.cardBody.createDiv(
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
			return
		}

		const samplesSection = this.cardBody.createDiv(
			"graphdb-analysis-property-card-samples-section"
		)
		const collapsibleGrid = samplesSection.createDiv(
			"graphdb-analysis-property-card-collapsible-grid"
		)

		// Sample values column (first)
		if (hasSampleValues) {
			createSampleColumn(collapsibleGrid, this.prop.sampleValues)
		}

		// Invalid wikilinks examples column
		const invalidWikilinkSamples =
			this.prop.validation?.validationDetails.filter(
				(d: { value: string; validation: { isWikilink: boolean; isValid: boolean } }) => d.validation.isWikilink && !d.validation.isValid
			) || []
		if (invalidWikilinkSamples.length > 0) {
			createIssueColumn(
				collapsibleGrid,
				"Invalid wikilinks:",
				"alert-circle",
				invalidWikilinkSamples
			)
		}

		// Non-existent files examples column
		const nonExistentSamples =
			this.prop.validation?.validationDetails.filter(
				(d: { value: string; validation: { fileExists: boolean | null } }) => d.validation.fileExists === false
			) || []
		if (nonExistentSamples.length > 0) {
			createIssueColumn(
				collapsibleGrid,
				"Non-existent files:",
				"file-x",
				nonExistentSamples
			)
		}

		// Inconsistent samples column
		const inconsistentSamples = this.prop.validation?.inconsistentSamples || []
		if (inconsistentSamples.length > 0) {
			createIssueColumn(
				collapsibleGrid,
				"Inconsistent:",
				"alert-triangle",
				inconsistentSamples,
				true
			)
		}
	}

	/**
	 * Refreshes mapping from settings
	 */
	private refreshMappingFromSettings(): void {
		const settingsMapping = getPropertyMapping(this.plugin.settings, this.prop.name)
		if (settingsMapping) {
			this.mapping.propertyName = settingsMapping.propertyName
			this.mapping.mappingType = settingsMapping.mappingType
			this.mapping.config = settingsMapping.config
			this.mapping.enabled = settingsMapping.enabled
		} else {
			this.mapping.propertyName = this.prop.name
			this.mapping.mappingType = undefined
			this.mapping.config = undefined
			this.mapping.enabled = false
		}
	}

	/**
	 * Unified save function (supports both immediate and debounced saves)
	 */
	private async saveMapping(immediate: boolean = false): Promise<void> {
		const saveAction = async () => {
			if (!this.plugin.settings.propertyMappings) {
				this.plugin.settings.propertyMappings = {}
			}

			if (this.mapping.mappingType === undefined) {
				delete this.plugin.settings.propertyMappings[this.prop.name]
				this.mapping.mappingType = undefined
				this.mapping.config = undefined
				this.mapping.enabled = false
			} else {
				this.plugin.settings.propertyMappings[this.prop.name] = this.mapping
			}

			await this.plugin.saveSettings()
			if (this.clearDebounceTimer) {
				this.clearDebounceTimer()
			}
		}

		if (immediate) {
			// Clear any pending debounced save
			if (this.debounceTimer) {
				clearTimeout(this.debounceTimer)
				this.debounceTimer = null
			}
			if (this.clearDebounceTimer) {
				this.clearDebounceTimer()
			}
			await saveAction()
		} else {
			// Debounced save (500ms delay)
			if (this.debounceTimer) {
				clearTimeout(this.debounceTimer)
			}

			const timer = setTimeout(saveAction, 500)
			this.debounceTimer = timer
			if (this.setDebounceTimer) {
				this.setDebounceTimer(timer)
			}
		}
	}

	/**
	 * Debounced save function (for backward compatibility)
	 */
	private debouncedSave(): void {
		this.saveMapping(false)
	}

	/**
	 * Centralized function to clean up relationship field
	 */
	private cleanupRelationshipField(): void {
		if (this.relationshipField) {
			this.relationshipField.fieldContainer.remove()
			this.relationshipField = null
		}
	}

	/**
	 * Function to update form visibility
	 */
	private updateConfigFormVisibility(): void {
		const isRelationship = this.mapping.mappingType === "relationship"
		const isNodeProperty = this.mapping.mappingType === "node_property"

		// Handle relationship field
		if (this.relationshipField) {
			if (!isRelationship || !this.mapping.config || !("relationshipType" in this.mapping.config)) {
				this.cleanupRelationshipField()
			} else {
				this.relationshipField.fieldContainer.style.display = ""
			}
		}

		if (isRelationship && !this.relationshipField) {
			// Always create fresh config when creating relationship field
			this.mapping.config = createRelationshipConfig()
			const configSection = this.cardBody.querySelector(".graphdb-analysis-property-card-config-section")
			if (configSection) {
				this.relationshipField = createRelationshipField(
					configSection as HTMLElement,
					this.mapping,
					this.prop.name,
					(updatedMapping) => {
						this.debouncedSave()
						const newPreview = this.getRelationshipPreviewText()
						this.updatePreviewDisplay(newPreview)
					}
				)
			}
		}

		// Handle node property field
		if (this.nodePropertyField) {
			this.nodePropertyField.style.display = isNodeProperty ? "" : "none"
		} else if (isNodeProperty) {
			const configSection = this.cardBody.querySelector(".graphdb-analysis-property-card-config-section")
			if (configSection) {
				this.nodePropertyField = createNodePropertyField(configSection as HTMLElement)
			}
		}
	}

	/**
	 * Function to update enable toggle state
	 */
	private updateEnableToggleState(): void {
		const hasMappingType = this.mapping.mappingType !== undefined
		const settingItem = this.enableSetting.settingEl

		if (this.toggleComponent) {
			this.toggleComponent.setDisabled(!hasMappingType)
			if (!hasMappingType) {
				this.mapping.enabled = false
				this.toggleComponent.setValue(false)
			}
		} else {
			const toggle = this.enableSetting.settingEl.querySelector("input[type='checkbox']") as HTMLInputElement
			if (toggle) {
				toggle.disabled = !hasMappingType
				if (!hasMappingType) {
					this.mapping.enabled = false
					toggle.checked = false
				}
			}
		}

		if (!hasMappingType) {
			settingItem.setAttribute("title", "Configure a mapping type to enable")
			settingItem.classList.add("graphdb-enable-toggle-disabled")
		} else {
			settingItem.removeAttribute("title")
			settingItem.classList.remove("graphdb-enable-toggle-disabled")
		}
	}

	/**
	 * Consolidated function to update all UI state based on mapping
	 */
	private updateMappingUIState(): void {
		this.updateConfigFormVisibility()
		this.updateEnableToggleState()
		const newPreview = this.getRelationshipPreviewText()
		this.updatePreviewDisplay(newPreview)
	}

	/**
	 * Gets property-level error statistics from last migration result
	 */
	private getPropertyErrorStats(): PropertyErrorStats | null {
		const lastResult = this.plugin.settings.lastMigrationResult
		if (!lastResult || !lastResult.propertyStats) {
			return null
		}
		return lastResult.propertyStats[this.prop.name] || null
	}

	/**
	 * Renders status indicator (checkmark or error badge) in header
	 */
	private renderStatusIndicator(): void {
		const stats = this.getPropertyErrorStats()
		if (!stats) {
			// No migration data for this property
			return
		}

		const statusContainer = this.cardHeader.createDiv(
			"graphdb-analysis-property-card-status"
		)

		if (stats.errorCount === 0 && stats.successCount > 0) {
			// 100% success - show green checkmark
			const checkIcon = statusContainer.createSpan(
				"graphdb-analysis-property-card-status-check"
			)
			setIcon(checkIcon, "check-circle")
			checkIcon.setAttribute("title", "All operations successful")
		} else if (stats.errorCount > 0) {
			// Errors exist - show error badge with count
			const errorBadge = statusContainer.createDiv(
				"graphdb-analysis-property-card-status-error"
			)
			const errorIcon = errorBadge.createSpan(
				"graphdb-analysis-property-card-status-error-icon"
			)
			setIcon(errorIcon, "alert-circle")
			const errorCount = errorBadge.createSpan(
				"graphdb-analysis-property-card-status-error-count"
			)
			errorCount.setText(`${stats.errorCount}`)
			errorBadge.setAttribute(
				"title",
				`${stats.errorCount} error${stats.errorCount === 1 ? "" : "s"}`
			)
		}
	}

	/**
	 * Renders expandable error section in card body
	 */
	private renderErrorSection(): void {
		const stats = this.getPropertyErrorStats()
		if (!stats || stats.errorCount === 0) {
			// No errors to display
			return
		}

		const errorSectionContainer = this.cardBody.createDiv(
			"graphdb-analysis-property-card-error-section"
		)

		// Error section header (clickable to expand/collapse)
		const errorHeader = errorSectionContainer.createDiv(
			"graphdb-analysis-property-card-error-header"
		)
		const errorHeaderIcon = errorHeader.createSpan(
			"graphdb-analysis-property-card-error-header-icon"
		)
		setIcon(errorHeaderIcon, "chevron-right")
		errorHeader.createSpan({
			text: `Errors (${stats.errorCount})`,
			cls: "graphdb-analysis-property-card-error-header-text",
		})

		// Error list (collapsed by default)
		this.errorSection = errorSectionContainer.createDiv(
			"graphdb-analysis-property-card-error-list"
		)
		this.errorSection.addClass("graphdb-analysis-property-card-error-list-hidden")

		// Populate error list
		for (const fileError of stats.fileErrors) {
			const errorItem = this.errorSection.createDiv(
				"graphdb-analysis-property-card-error-item"
			)

			// File link
			const fileLinkContainer = errorItem.createDiv(
				"graphdb-analysis-property-card-error-file"
			)
			this.createFileLink(
				fileLinkContainer,
				fileError.file,
				fileError.file
			)

			// Error message
			const errorMessage = errorItem.createDiv(
				"graphdb-analysis-property-card-error-message"
			)
			errorMessage.setText(fileError.error)

			// Target information (for relationship errors)
			if ("target" in fileError && fileError.target) {
				const targetInfo = errorItem.createDiv(
					"graphdb-analysis-property-card-error-target"
				)
				targetInfo.createSpan({
					text: "Target: ",
					cls: "graphdb-analysis-property-card-error-target-label",
				})
				this.createFileLink(
					targetInfo,
					fileError.target,
					fileError.target
				)
			}
		}

		// Toggle expand/collapse on header click
		errorHeader.addEventListener("click", () => {
			this.errorSectionExpanded = !this.errorSectionExpanded
			if (this.errorSectionExpanded) {
				this.errorSection?.removeClass("graphdb-analysis-property-card-error-list-hidden")
				setIcon(errorHeaderIcon, "chevron-down")
			} else {
				this.errorSection?.addClass("graphdb-analysis-property-card-error-list-hidden")
				setIcon(errorHeaderIcon, "chevron-right")
			}
		})

		errorHeader.addClass("graphdb-analysis-property-card-error-header-clickable")
	}

	/**
	 * Creates an Obsidian internal file link with hover card support
	 */
	private createFileLink(container: HTMLElement, filePath: string, displayText: string): void {
		// Check if file exists
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath)
		const fileExists = file !== null

		if (fileExists) {
			// Create internal link with hover card support
			const link = container.createEl("a", {
				text: displayText,
				cls: "internal-link",
				attr: {
					"data-href": filePath,
					href: filePath,
				},
			})

			// Register hover link event
			this.component.registerDomEvent(link, "mouseover", (event: MouseEvent) => {
				event.preventDefault()
				this.plugin.app.workspace.trigger("hover-link", {
					event,
					source: "graphdb-sync",
					hoverParent: { hoverPopover: null },
					targetEl: event.currentTarget,
					linktext: filePath,
					sourcePath: "",
				})
			})

			// Open file on click
			this.component.registerDomEvent(link, "click", async (event: MouseEvent) => {
				event.preventDefault()
				const targetFile = this.plugin.app.vault.getAbstractFileByPath(filePath)
				if (targetFile) {
					await this.plugin.app.workspace.openLinkText(filePath, "", true)
				}
			})
		} else {
			// File doesn't exist - show as text only
			container.createSpan({
				text: displayText,
				cls: "graphdb-analysis-property-card-error-file-missing",
			})
		}
	}

	/**
	 * Cleanup method for when card is removed
	 */
	destroy(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer)
		}
		if (this.clearDebounceTimer) {
			this.clearDebounceTimer()
		}
		this.component.unload()
		this.cleanupRelationshipField()
	}
}

