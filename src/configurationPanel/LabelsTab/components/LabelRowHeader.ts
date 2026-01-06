import { setIcon } from "obsidian"
import type { LabelRule } from "../../../types"

/**
 * Label row header component
 * Displays label name, type icon, pattern summary, and action icons (edit, error, save)
 */
export class LabelRowHeader {
	private rule: LabelRule
	private rowEl: HTMLElement
	private onExpand: () => void
	private onAttemptSave: () => void
	private onSave: (() => void) | null = null
	private actionIconContainer: HTMLElement | null = null
	private editIcon: HTMLElement | null = null
	private errorIcon: HTMLElement | null = null
	private saveButton: HTMLElement | null = null
	private isExpanded: boolean = false
	private isValid: boolean = true

	constructor(
		rowEl: HTMLElement,
		rule: LabelRule,
		callbacks: {
			onExpand: () => void
			onAttemptSave: () => void
			onSave?: () => void
		},
		state: {
			isExpanded: boolean
			isValid: boolean
		}
	) {
		this.rowEl = rowEl
		this.rule = rule
		this.onExpand = callbacks.onExpand
		this.onAttemptSave = callbacks.onAttemptSave
		this.onSave = callbacks.onSave || null
		this.isExpanded = state.isExpanded
		this.isValid = state.isValid
		this.render()
	}

	private render(): void {
		this.rowEl.empty()

		// First row group: label name, pattern, and action icons
		const firstRowGroup = this.rowEl.createDiv("graphdb-label-row-first-group")

		// Label name container (fixed width for alignment)
		const nameContainer = firstRowGroup.createDiv("graphdb-label-row-name-container")
		const nameEl = nameContainer.createDiv("graphdb-label-row-name")
		nameEl.setText(this.rule.labelName)

		// Pattern container (separate from name for alignment - always present)
		const patternContainer = firstRowGroup.createDiv("graphdb-label-row-pattern-container")
		if (this.rule.pattern) {
			const patternIcon = patternContainer.createSpan("graphdb-label-row-pattern-icon")
			const iconName = this.rule.type === "tag" ? "hash" : "folder"
			setIcon(patternIcon, iconName)
			const patternText = patternContainer.createSpan("graphdb-label-row-pattern")
			patternText.setText(this.rule.pattern)
		}
		// Container always exists to maintain alignment even when pattern is empty

		// Action icon container (edit, error, save) - positioned at far right
		this.actionIconContainer = firstRowGroup.createDiv("graphdb-label-row-action-icon-container")

		// Edit icon (shown on hover when collapsed)
		this.editIcon = this.actionIconContainer.createSpan("graphdb-label-row-edit-icon")
		setIcon(this.editIcon, "pencil")
		this.editIcon.setAttr("title", "Edit label rule")

		// Error icon (shown when invalid)
		this.errorIcon = this.actionIconContainer.createSpan("graphdb-label-row-error-icon")
		setIcon(this.errorIcon, "alert-circle")
		this.errorIcon.setAttr("title", "Rule is invalid")

		// Save button (shown when expanded and valid)
		this.saveButton = this.actionIconContainer.createSpan("graphdb-label-row-save-button")
		setIcon(this.saveButton, "save")
		this.saveButton.setAttr("role", "button")
		this.saveButton.setAttr("tabindex", "0")
		this.saveButton.setAttr("aria-label", "Save label rule")
		this.saveButton.setAttr("title", "Save label rule")

		this.saveButton.addEventListener("click", (e) => {
			e.stopPropagation()
			if (this.onSave) {
				this.onSave()
			}
		})
		this.saveButton.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				if (this.onSave) {
					this.onSave()
				}
			}
		})

		// Make entire row clickable
		// If collapsed: expand (request to edit)
		// If expanded: attempt save (may collapse on success)
		this.rowEl.onclick = (e) => {
			// Stop propagation to prevent affecting other rows
			e.stopPropagation()
			if (this.isExpanded) {
				this.onAttemptSave()
			} else {
				this.onExpand()
			}
		}

		// Update icon visibility based on initial state
		this.updateIconVisibility()
	}

	/**
	 * Updates the header state (expanded/collapsed, validation state)
	 */
	updateState(isExpanded: boolean, isValid: boolean): void {
		this.isExpanded = isExpanded
		this.isValid = isValid
		this.updateIconVisibility()
	}

	/**
	 * Updates the rule data and re-renders
	 */
	updateRule(rule: LabelRule): void {
		this.rule = rule
		// Re-render to update name and pattern
		this.render()
	}

	/**
	 * Updates icon visibility based on current state
	 */
	private updateIconVisibility(): void {
		if (!this.actionIconContainer || !this.errorIcon || !this.saveButton) return

		// Error icon: show if invalid (highest priority)
		if (!this.isValid) {
			this.actionIconContainer.addClass("has-error")
		} else {
			this.actionIconContainer.removeClass("has-error")
		}

		// Save button disabled state (based on validation)
		if (this.isExpanded && this.isValid) {
			this.saveButton.removeClass("graphdb-label-row-save-button-disabled")
		} else {
			this.saveButton.addClass("graphdb-label-row-save-button-disabled")
		}

		// Edit icon visibility is handled by CSS hover
		// Error and save button visibility is handled by CSS based on classes and row state
	}

	/**
	 * Sets the save button enabled/disabled state
	 */
	setSaveButtonEnabled(enabled: boolean): void {
		if (!this.saveButton) return
		if (enabled) {
			this.saveButton.removeClass("graphdb-label-row-save-button-disabled")
		} else {
			this.saveButton.addClass("graphdb-label-row-save-button-disabled")
		}
	}
}

