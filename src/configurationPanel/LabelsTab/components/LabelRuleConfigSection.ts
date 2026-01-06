import { setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../../../main"
import type { LabelRule } from "../../../types"
import { ConfigurationService } from "../../../services/ConfigurationService"
import { LabelValidationHandler } from "../handlers/LabelValidationHandler"
import type { ValidationResult } from "../handlers/LabelValidationHandler"
import { PatternSelector } from "./PatternSelector"
import { sanitizeLabelName, cleanLabelName } from "../utils/labelNameSanitizer"

/**
 * Label rule configuration section component
 * Handles rendering and interaction for label rule configuration
 */
export class LabelRuleConfigSection {
	private plugin: GraphDBSyncPlugin
	private ruleId: string
	private container: HTMLElement
	private labelNameContainer: HTMLElement
	private ruleTypeSelect: HTMLSelectElement | null = null
	private labelNameInput: HTMLInputElement | null = null
	private labelNameErrorEl: HTMLElement | null = null
	private patternErrorEl: HTMLElement | null = null
	private patternSelector: PatternSelector | null = null
	private validationHandler: LabelValidationHandler
	private validationResult: ValidationResult | null = null
	private onUpdate: (() => void) | null = null
	private onValidationChange: ((isValid: boolean) => void) | null = null
	private onSaveSuccess: (() => void) | null = null

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		ruleId: string,
		labelNameContainer: HTMLElement,
		callbacks: {
			onUpdate?: () => void
			onValidationChange?: (isValid: boolean) => void
			onSaveSuccess?: () => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.ruleId = ruleId
		this.labelNameContainer = labelNameContainer
		this.onUpdate = callbacks.onUpdate || null
		this.onValidationChange = callbacks.onValidationChange || null
		this.onSaveSuccess = callbacks.onSaveSuccess || null
		this.validationHandler = new LabelValidationHandler(plugin, ruleId)
	}

	/**
	 * Renders the label rule configuration UI
	 */
	render(rule: LabelRule | null): void {
		// Label name input (in first row container)
		this.labelNameInput = this.labelNameContainer.createEl("input", {
			type: "text",
			cls: "graphdb-property-config-input",
			value: rule?.labelName || "",
			placeholder: "e.g., Project, Active",
		})

		// Error message container for label name
		this.labelNameErrorEl = this.labelNameContainer.createDiv(
			"graphdb-label-row-config-error-message"
		)

		// Intercept space key to convert to underscore
		this.labelNameInput.addEventListener("keydown", (e) => {
			if (e.key === " ") {
				e.preventDefault()
				const input = this.labelNameInput!
				const start = input.selectionStart || 0
				const end = input.selectionEnd || 0
				const value = input.value
				const newValue =
					value.substring(0, start) + "_" + value.substring(end)
				input.value = newValue
				input.setSelectionRange(start + 1, start + 1)
				this.handleLabelNameInput()
			}
		})

		this.labelNameInput.addEventListener("input", () => {
			this.handleLabelNameInput()
		})

		// Second row: rule type and pattern on same row
		const typePatternRow = this.container.createDiv(
			"graphdb-label-row-config-type-pattern-row"
		)

		// Rule type toggle button (icon-only, switches between tag and folder)
		const typeContainer = typePatternRow.createDiv(
			"graphdb-label-row-config-type-container"
		)

		// Create a hidden select for compatibility with existing code
		this.ruleTypeSelect = typeContainer.createEl("select", {
			cls: "graphdb-label-row-config-type-select-hidden",
		})
		this.ruleTypeSelect.createEl("option", { value: "tag", text: "Tag" })
		this.ruleTypeSelect.createEl("option", { value: "path", text: "Path" })
		this.ruleTypeSelect.value = rule?.type || "tag"

		// Create clickable button with icon that toggles between tag and folder
		const typeButton = typeContainer.createDiv(
			"graphdb-label-row-config-type-button"
		)
		const typeIconDisplay = typeButton.createSpan(
			"graphdb-label-row-config-type-icon"
		)
		this.updateTypeIcon(typeIconDisplay, this.ruleTypeSelect.value)

		// Toggle between tag and folder when clicked
		typeButton.addEventListener("click", (e) => {
			e.stopPropagation()
			// Toggle between tag and folder
			const currentType = this.ruleTypeSelect!.value
			const newType = currentType === "tag" ? "path" : "tag"
			this.ruleTypeSelect!.value = newType
			this.updateTypeIcon(typeIconDisplay, newType)
			this.handleRuleTypeChange()
		})

		// Pattern selector
		const patternContainer = typePatternRow.createDiv(
			"graphdb-label-row-config-pattern-container"
		)
		this.patternSelector = new PatternSelector(
			patternContainer,
			this.plugin,
			this.ruleId
		)
		this.patternSelector.updateOptions(
			this.getRuleType(),
			rule?.pattern
		)
		if (rule?.pattern) {
			this.patternSelector.setValue(rule.pattern)
		}
		this.patternSelector.onChange(() => {
			this.handlePatternChange()
		})

		// Error message container for pattern
		this.patternErrorEl = patternContainer.createDiv(
			"graphdb-label-row-config-error-message"
		)

		// Initial validation
		this.updateValidationDisplay()
	}

	/**
	 * Updates the type icon display
	 */
	private updateTypeIcon(iconEl: HTMLElement, type: string): void {
		iconEl.empty()
		const iconName = type === "tag" ? "hash" : "folder"
		setIcon(iconEl, iconName)
	}

	/**
	 * Gets the current rule type
	 */
	getRuleType(): "tag" | "path" {
		return (this.ruleTypeSelect?.value as "tag" | "path") || "tag"
	}

	/**
	 * Gets the current pattern
	 */
	getPattern(): string {
		return this.patternSelector?.getValue() || ""
	}

	/**
	 * Gets the current label name
	 */
	getLabelName(): string {
		return this.labelNameInput?.value || ""
	}

	/**
	 * Handles rule type change
	 */
	private handleRuleTypeChange(): void {
		if (!this.patternSelector) return
		const currentValue = this.patternSelector.getValue()
		this.patternSelector.updateOptions(this.getRuleType(), currentValue)
		this.updateValidationDisplay()
	}

	/**
	 * Handles pattern change
	 */
	private handlePatternChange(): void {
		this.updateValidationDisplay()
	}

	/**
	 * Handles label name input
	 */
	private handleLabelNameInput(): void {
		if (!this.labelNameInput) return

		const input = this.labelNameInput
		const cursorPosition = input.selectionStart || 0
		const value = input.value

		const sanitized = sanitizeLabelName(value, cursorPosition)

		if (value !== sanitized.value) {
			input.value = sanitized.value
			// Restore cursor position
			setTimeout(() => {
				if (input) {
					input.setSelectionRange(
						sanitized.cursorPosition,
						sanitized.cursorPosition
					)
				}
			}, 0)
		}

		// Update validation (no auto-save)
		this.updateValidationDisplay()
	}

	/**
	 * Updates validation display (borders, error messages, save button state)
	 */
	private updateValidationDisplay(): void {
		if (!this.labelNameInput || !this.patternSelector) return

		const labelName = this.labelNameInput.value.trim()
		const ruleType = this.getRuleType()
		const pattern = this.patternSelector.getValue()

		this.validationResult = this.validationHandler.validate(
			labelName,
			ruleType,
			pattern
		)

		// Update label name field
		if (this.labelNameInput && this.labelNameErrorEl) {
			if (this.validationResult.errors.labelName) {
				this.labelNameInput.addClass(
					"graphdb-label-row-config-input-invalid"
				)
				this.labelNameErrorEl.setText(
					this.validationResult.errors.labelName
				)
			} else {
				this.labelNameInput.removeClass(
					"graphdb-label-row-config-input-invalid"
				)
				this.labelNameErrorEl.setText("") // Clear text (CSS :not(:empty) handles visibility)
			}
		}

		// Update pattern field
		if (this.patternSelector && this.patternErrorEl) {
			const select = this.patternSelector["select"] as HTMLSelectElement
			if (this.validationResult.errors.pattern) {
				select.addClass("graphdb-label-row-config-select-invalid")
				this.patternErrorEl.setText(this.validationResult.errors.pattern)
			} else {
				select.removeClass("graphdb-label-row-config-select-invalid")
				this.patternErrorEl.setText("") // Clear text (CSS :not(:empty) handles visibility)
			}
		}

		// Notify parent of validation state change
		if (this.onValidationChange) {
			this.onValidationChange(this.validationResult.isValid)
		}
	}

	/**
	 * Gets the current validation state
	 */
	getValidationState(): ValidationResult | null {
		return this.validationResult
	}

	/**
	 * Handles save - exposed as public method for header to call
	 */
	async handleSave(): Promise<void> {
		// Re-validate before saving
		this.updateValidationDisplay()

		if (!this.validationResult || !this.validationResult.isValid) {
			return
		}

		if (!this.ruleTypeSelect || !this.patternSelector || !this.labelNameInput)
			return

		// Get existing rule to preserve ID
		const existingRule = ConfigurationService.getLabelRule(
			this.plugin.settings,
			this.ruleId
		)
		if (!existingRule) {
			// Rule was deleted, can't save
			return
		}

		const ruleType = this.getRuleType()
		const pattern = this.patternSelector.getValue()
		let labelName = this.labelNameInput.value.trim()

		// Clean up label name
		labelName = cleanLabelName(labelName)

		// Update input field to show the cleaned-up value
		if (this.labelNameInput.value !== labelName && labelName) {
			this.labelNameInput.value = labelName
		}

		const rule: LabelRule = {
			id: this.ruleId, // Preserve the ID
			labelName: labelName,
			type: ruleType,
			pattern: pattern,
		}

		await ConfigurationService.saveLabelRule(this.plugin, rule)

		// Re-validate after save (should still be valid)
		this.updateValidationDisplay()

		// Notify update
		if (this.onUpdate) {
			this.onUpdate()
		}

		// Notify save success (to collapse row)
		if (this.onSaveSuccess) {
			this.onSaveSuccess()
		}
	}
}

