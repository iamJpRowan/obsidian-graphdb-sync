import type GraphDBSyncPlugin from "../../../main"
import {
	isPatternInUse,
	isLabelNameInUse,
} from "../utils/patternUniqueness"
import { tagExists, folderExists } from "../utils/patternOptions"

/**
 * Validation result interface
 */
export interface ValidationResult {
	isValid: boolean
	errors: {
		labelName?: string
		pattern?: string
		type?: string
	}
}

/**
 * Validation handler for label rules
 * Handles all validation logic for label rule configuration
 */
export class LabelValidationHandler {
	private plugin: GraphDBSyncPlugin
	private ruleId: string

	constructor(plugin: GraphDBSyncPlugin, ruleId: string) {
		this.plugin = plugin
		this.ruleId = ruleId
	}

	/**
	 * Validates a label rule configuration
	 * @param labelName - Label name to validate
	 * @param ruleType - Rule type ("tag" or "path")
	 * @param pattern - Pattern to validate
	 * @returns Validation result with errors if any
	 */
	validate(
		labelName: string,
		ruleType: "tag" | "path",
		pattern: string
	): ValidationResult {
		const errors: ValidationResult["errors"] = {}

		// Validate label name
		if (!labelName) {
			errors.labelName = "Label name is required"
		} else if (!/^[A-Za-z]/.test(labelName)) {
			errors.labelName = "Must start with a letter"
		} else if (!/^[A-Za-z][A-Z0-9_]*$/i.test(labelName)) {
			errors.labelName = "Only letters, numbers, and underscores allowed"
		} else {
			// Check uniqueness
			if (
				isLabelNameInUse(
					this.plugin.settings,
					this.ruleId,
					labelName
				)
			) {
				errors.labelName = "Label name already in use"
			}
		}

		// Validate type
		if (ruleType !== "tag" && ruleType !== "path") {
			errors.type = "Invalid rule type"
		}

		// Validate pattern
		if (!pattern) {
			errors.pattern = "Value is required"
		} else if (ruleType === "tag") {
			// Check if tag exists
			if (!tagExists(this.plugin.app, pattern)) {
				errors.pattern = "Tag not found"
			} else {
				// Check uniqueness
				if (
					isPatternInUse(
						this.plugin.settings,
						this.ruleId,
						pattern,
						"tag"
					)
				) {
					errors.pattern = "Tag already in use by another rule"
				}
			}
		} else if (ruleType === "path") {
			// Check if folder exists
			if (!folderExists(this.plugin.app, pattern)) {
				errors.pattern = "Folder not found"
			} else {
				// Check uniqueness
				if (
					isPatternInUse(
						this.plugin.settings,
						this.ruleId,
						pattern,
						"path"
					)
				) {
					errors.pattern = "Folder already in use by another rule"
				}
			}
		}

		return {
			isValid: Object.keys(errors).length === 0,
			errors,
		}
	}
}

