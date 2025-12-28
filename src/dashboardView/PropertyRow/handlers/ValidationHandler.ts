import { Notice } from "obsidian"
import type GraphDBSyncPlugin from "../../../main"
import type { ValidationResult } from "../../../types"
import { RelationshipValidationService } from "../../../services/RelationshipValidationService"
import { NodePropertyValidationService } from "../../../services/NodePropertyValidationService"
import { ValidationBadge } from "../components/ValidationBadge"
import { ValidationIssuesModal } from "../components/ValidationIssuesModal"
import { getPropertyRowState } from "../utils/PropertyRowState"

/**
 * Validation handler component
 * Handles validation logic and badge updates for property rows
 */
export class ValidationHandler {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private validationBadge: ValidationBadge | null = null
	private validationResult: ValidationResult | null = null
	private isValidating: boolean = false

	constructor(plugin: GraphDBSyncPlugin, propertyName: string) {
		this.plugin = plugin
		this.propertyName = propertyName
	}

	/**
	 * Renders the validation badge in the provided container
	 */
	render(container: HTMLElement): void {
		this.validationBadge = new ValidationBadge(container)
		this.updateBadge()
	}

	/**
	 * Resets validation state (e.g., when mapping type changes)
	 */
	reset(): void {
		this.validationResult = null
		this.isValidating = false
		this.updateBadge()
	}

	/**
	 * Gets the current validation result
	 */
	getValidationResult(): ValidationResult | null {
		return this.validationResult
	}

	/**
	 * Gets the current validating state
	 */
	isValidatingState(): boolean {
		return this.isValidating
	}

	/**
	 * Runs validation for the current mapping
	 */
	async validate(): Promise<void> {
		const state = getPropertyRowState(this.plugin, this.propertyName)

		if (!state.relationship && !state.nodeProperty) {
			new Notice("Please configure a mapping first")
			return
		}

		// Set validating state
		this.isValidating = true
		this.updateBadge()

		try {
			if (state.relationship) {
				this.validationResult = await RelationshipValidationService.validateRelationshipProperty(
					this.plugin.app,
					this.propertyName
				)
			} else if (state.nodeProperty) {
				this.validationResult = await NodePropertyValidationService.validateNodeProperty(
					this.plugin.app,
					this.propertyName,
					this.plugin.settings
				)
			}
		} catch (error) {
			new Notice(`Validation error: ${error instanceof Error ? error.message : String(error)}`)
		} finally {
			this.isValidating = false
			this.updateBadge()
		}
	}

	/**
	 * Updates the validation badge based on current state
	 */
	private updateBadge(): void {
		if (!this.validationBadge) return

		if (this.isValidating) {
			this.validationBadge.renderValidating()
		} else if (this.validationResult) {
			if (this.validationResult.isValid) {
				this.validationBadge.renderNoIssues(() => {
					this.validate()
				})
			} else {
				const issueCount = this.validationResult.filesWithIssues.length
				this.validationBadge.renderHasIssues(
					issueCount,
					() => {
						// Open modal
						new ValidationIssuesModal(
							this.plugin,
							this.validationResult!
						).open()
					},
					() => {
						// Right-click: re-run validation
						this.validate()
					}
				)
			}
		}
	}
}

