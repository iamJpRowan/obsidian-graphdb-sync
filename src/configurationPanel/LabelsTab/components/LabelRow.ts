import type GraphDBSyncPlugin from "../../../main"
import type { LabelRule } from "../../../types"
import { setIcon } from "obsidian"
import { LabelRowHeader } from "./LabelRowHeader"
import { LabelRuleConfigSection } from "./LabelRuleConfigSection"
import { SyncIcon } from "../../PropertyRow/components/SyncIcon"
import { LabelSyncHandler } from "../handlers/LabelSyncHandler"
import { ConfigurationService } from "../../../services/ConfigurationService"

/**
 * Label row component
 * Shows label rule with header and expandable configuration panel
 */
export class LabelRow {
	private plugin: GraphDBSyncPlugin
	private rule: LabelRule
	private container: HTMLElement
	private rowEl: HTMLElement
	private rowWrapper: HTMLElement | null = null
	private header: LabelRowHeader | null = null
	private configContainer: HTMLElement | null = null
	private configPanelVisible: boolean = false
	private configSection: LabelRuleConfigSection | null = null
	private syncIcon: SyncIcon | null = null
	private syncHandler: LabelSyncHandler | null = null
	private onDelete: (id: string) => void
	private onSaveSuccess?: () => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		rule: LabelRule,
		onDelete: (id: string) => void,
		onSaveSuccess?: () => void
	) {
		this.container = container
		this.plugin = plugin
		this.rule = rule
		this.onDelete = onDelete
		this.onSaveSuccess = onSaveSuccess
		this.render()
	}

	private render(): void {
		// Main row container
		this.rowWrapper = this.container.createDiv("graphdb-label-row-wrapper")

		this.rowEl = this.rowWrapper.createDiv("graphdb-label-row")

		// Render header (will be updated with state after config section is created)
		this.header = new LabelRowHeader(
			this.rowEl,
			this.rule,
			{
				onExpand: () => this.expand(),
				onAttemptSave: () => this.attemptSaveAndCollapse(),
				onSave: () => this.handleSave(), // Redundant save button
			},
			{
				isExpanded: this.configPanelVisible,
				isValid: true, // Will be updated after validation
			}
		)

		// Configuration container (hidden by default)
		this.configContainer = this.rowWrapper.createDiv("graphdb-label-row-config")

		// Initialize sync handler (needed before rendering config)
		this.syncHandler = new LabelSyncHandler(
			this.plugin,
			this.rule.id,
			(state) => {
				// Update sync icon state
				if (this.syncIcon) {
					if (state === "normal") {
						this.syncIcon.renderNormal(false)
					} else if (state === "queued") {
						this.syncIcon.renderQueued()
					} else if (state === "processing") {
						this.syncIcon.renderProcessing()
					}
				}
			}
		)

		this.renderConfiguration()
	}

	private renderConfiguration(): void {
		if (!this.configContainer) return

		this.configContainer.empty()

		// First row: label name, sync, delete
		const firstRow = this.configContainer.createDiv("graphdb-label-row-config-first-row")

		// Label name input (will be created by config section, but we need the container)
		const labelNameContainer = firstRow.createDiv("graphdb-label-row-config-label-name-container")

		// Sync icon container
		const syncContainer = firstRow.createDiv("graphdb-label-row-config-sync-container")
		this.syncIcon = new SyncIcon(syncContainer, () => this.syncHandler?.handleSync())
		// Initial state
		this.syncIcon.renderNormal(false)

		// Delete button
		const deleteEl = firstRow.createSpan("graphdb-label-row-config-delete")
		setIcon(deleteEl, "trash")
		deleteEl.addEventListener("click", (e) => {
			e.stopPropagation()
			this.onDelete(this.rule.id)
		})

		// Create config section (will populate labelNameContainer and add other fields)
		this.configSection = new LabelRuleConfigSection(
			this.configContainer,
			this.plugin,
			this.rule.id,
			labelNameContainer,
			{
				onUpdate: () => {
					// Reload rule and update header
					const updatedRule = ConfigurationService.getLabelRule(
						this.plugin.settings,
						this.rule.id
					)
					if (updatedRule) {
						this.rule = updatedRule
						// Update header with new rule data
						if (this.header) {
							this.header.updateRule(this.rule)
							// Update header state
							const validationState = this.configSection?.getValidationState()
							this.updateHeaderState(validationState?.isValid ?? true)
						}
					}
				},
				onValidationChange: (isValid) => {
					// Update header state
					this.updateHeaderState(isValid)
				},
				onSaveSuccess: () => {
					// Collapse the row after successful save
					this.collapse()
					// Notify parent that rule was saved (for sorting)
					if (this.onSaveSuccess) {
						this.onSaveSuccess()
					}
				},
			}
		)
		this.configSection.render(this.rule)

		// Initial validation state check and update header
		const validationState = this.configSection.getValidationState()
		this.updateHeaderState(validationState?.isValid ?? true)
	}

	/**
	 * Expands the configuration panel (no validation needed)
	 * Public method for external access (used by LabelsTab to preserve expanded state)
	 */
	expand(): void {
		if (!this.configContainer) return

		this.configPanelVisible = true
		this.configContainer.addClass("graphdb-label-row-config-visible")
		this.rowEl.addClass("graphdb-label-row-expanded")

		// Update header state
		const validationState = this.configSection?.getValidationState()
		this.updateHeaderState(validationState?.isValid ?? true)
	}

	/**
	 * Attempts to save and collapse (only collapses if save succeeds)
	 */
	private async attemptSaveAndCollapse(): Promise<void> {
		if (!this.configSection) return

		// Check validation state
		const validationState = this.configSection.getValidationState()

		// If invalid, don't collapse
		if (!validationState?.isValid) {
			// Could show a notice here: "Please fix validation errors before saving"
			return
		}

		// Attempt save - this will call onSaveSuccess callback if successful
		await this.configSection.handleSave()
		// Note: handleSave() calls onSaveSuccess which calls collapse()
	}

	/**
	 * Collapses the configuration panel
	 */
	private collapse(): void {
		if (!this.configContainer) return

		this.configPanelVisible = false
		this.configContainer.removeClass("graphdb-label-row-config-visible")
		this.rowEl.removeClass("graphdb-label-row-expanded")

		// Update header state
		const validationState = this.configSection?.getValidationState()
		this.updateHeaderState(validationState?.isValid ?? true)
	}

	/**
	 * Updates header state (expanded/collapsed, validation)
	 */
	private updateHeaderState(isValid: boolean): void {
		if (this.header) {
			this.header.updateState(this.configPanelVisible, isValid)
		}
	}

	/**
	 * Handles save button click from header
	 */
	private async handleSave(): Promise<void> {
		if (this.configSection) {
			await this.configSection.handleSave()
		}
	}

	/**
	 * Gets the label rule ID
	 */
	getId(): string {
		return this.rule.id
	}

	/**
	 * Gets the label name
	 */
	getLabelName(): string {
		return this.rule.labelName
	}

	/**
	 * Checks if the row is currently expanded
	 */
	isExpanded(): boolean {
		return this.configPanelVisible
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.syncHandler) {
			this.syncHandler.destroy()
			this.syncHandler = null
		}
		this.rowWrapper?.remove()
	}
}

