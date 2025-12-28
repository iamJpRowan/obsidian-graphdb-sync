import type { App } from "obsidian"
import { extractFrontMatter } from "../utils/frontMatterExtractor"
import type { ValidationResult, ValidationIssueType, ValidationIssueSeverity, FrontMatterValue, PluginSettings } from "../types"
import { ConfigurationService } from "./ConfigurationService"

/**
 * Validation service for node property mappings
 * Checks for data that will fail during sync/migration based on the configured type
 */
export class NodePropertyValidationService {
	/**
	 * Validates a property configured as a node property mapping
	 * Returns validation results with issues and file details
	 * 
	 * Issues checked based on node property type:
	 * - Boolean: non-boolean values
	 * - Integer: non-integer numeric values
	 * - Float: non-numeric values
	 * - Date: invalid date formats
	 * - DateTime: invalid datetime formats
	 * - String: minimal validation (any string is valid)
	 * - List (String): validation ensures values can be converted to strings
	 */
	static async validateNodeProperty(
		app: App,
		propertyName: string,
		settings: PluginSettings
	): Promise<ValidationResult> {
		// Get the node property mapping to determine the type
		const mapping = ConfigurationService.getNodePropertyMapping(settings, propertyName)
		if (!mapping) {
			return {
				propertyName,
				isValid: false,
				issues: [{
					type: "missing_mapping",
					severity: "error",
					message: "Node property mapping not configured",
					count: 1,
				}],
				filesWithIssues: [],
			}
		}

		const markdownFiles = app.vault.getMarkdownFiles()
		const filesWithIssues: ValidationResult["filesWithIssues"] = []
		const issueCounts: Record<ValidationIssueType, number> = {
			invalid_wikilink: 0,
			non_existent_file: 0,
			inconsistent_pattern: 0,
			missing_mapping: 0,
		}

		// Collect all values for this property
		for (const file of markdownFiles) {
			const frontMatter = extractFrontMatter(app, file)
			if (!frontMatter || !(propertyName in frontMatter)) {
				continue
			}

			const value = frontMatter[propertyName]

			// Special handling for list_string type
			if (mapping.nodePropertyType === "list_string") {
				// list_string accepts arrays or single values (single values will be converted to arrays)
				// All values are acceptable (will be converted to strings)
				// No validation needed - any value can be converted to string
				continue
			}

			// Handle array values (multitext properties)
			if (Array.isArray(value)) {
				for (const item of value) {
					// Skip null/undefined values - they won't cause sync issues
					if (item === null || item === undefined) {
						continue
					}
					const issue = this.validateValue(item, mapping.nodePropertyType)
					if (issue) {
						issueCounts[issue]++
						filesWithIssues.push({
							file,
							value: String(item),
							issue: {
								type: issue,
								severity: "error" as ValidationIssueSeverity,
								message: this.getIssueMessage(issue, mapping.nodePropertyType),
								count: issueCounts[issue],
							},
						})
					}
				}
			} else {
				// Skip null/undefined values - they won't cause sync issues
				if (value === null || value === undefined) {
					continue
				}
				// Single value
				const issue = this.validateValue(value, mapping.nodePropertyType)
				if (issue) {
					issueCounts[issue]++
					filesWithIssues.push({
						file,
						value: String(value),
						issue: {
							type: issue,
							severity: "error" as ValidationIssueSeverity,
							message: this.getIssueMessage(issue, mapping.nodePropertyType),
							count: issueCounts[issue],
						},
					})
				}
			}
		}

		// Build issues array
		const issues: ValidationResult["issues"] = []
		if (issueCounts.inconsistent_pattern > 0) {
			issues.push({
				type: "inconsistent_pattern",
				severity: "error",
				message: this.getIssueMessage("inconsistent_pattern", mapping.nodePropertyType),
				count: issueCounts.inconsistent_pattern,
			})
		}

		return {
			propertyName,
			isValid: issues.length === 0,
			issues,
			filesWithIssues,
		}
	}

	/**
	 * Validates a single value against the node property type
	 * Returns issue type if validation fails, null if valid
	 */
	private static validateValue(
		value: FrontMatterValue,
		nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
	): ValidationIssueType | null {
		// Skip null/undefined - already handled by caller, but double-check
		if (value === null || value === undefined) {
			return null
		}

		switch (nodePropertyType) {
			case "boolean":
				// Accept boolean true/false or string "true"/"false"
				if (typeof value === "boolean") {
					return null
				}
				if (typeof value === "string") {
					const lower = value.toLowerCase().trim()
					if (lower === "true" || lower === "false") {
						return null
					}
				}
				return "inconsistent_pattern"

			case "integer":
				// Accept numbers that are integers, or strings that parse to integers
				if (typeof value === "number") {
					return Number.isInteger(value) ? null : "inconsistent_pattern"
				}
				if (typeof value === "string") {
					const num = Number(value.trim())
					if (!isNaN(num) && Number.isInteger(num)) {
						return null
					}
				}
				return "inconsistent_pattern"

			case "float":
				// Accept any number or string that parses to a number
				if (typeof value === "number") {
					return null
				}
				if (typeof value === "string") {
					const num = Number(value.trim())
					if (!isNaN(num)) {
						return null
					}
				}
				return "inconsistent_pattern"

			case "date":
				// Reject numbers - date type should only accept date strings
				if (typeof value === "number") {
					return "inconsistent_pattern"
				}
				// Accept strings that can be parsed as dates
				if (typeof value === "string") {
					const date = new Date(value.trim())
					if (!isNaN(date.getTime())) {
						return null
					}
				}
				// Also accept Date objects (though unlikely in front matter)
				if (value instanceof Date) {
					return null
				}
				return "inconsistent_pattern"

			case "datetime":
				// Reject numbers - datetime type should only accept datetime strings
				if (typeof value === "number") {
					return "inconsistent_pattern"
				}
				// Accept strings that can be parsed as dates/datetimes
				// Same validation as date - both accept date and datetime strings
				if (typeof value === "string") {
					const date = new Date(value.trim())
					if (!isNaN(date.getTime())) {
						return null
					}
				}
				// Also accept Date objects (though unlikely in front matter)
				if (value instanceof Date) {
					return null
				}
				return "inconsistent_pattern"

			case "string":
				// Strings accept any value (convertible to string)
				return null

			case "list_string":
				// list_string accepts any value (will be converted to string)
				// This case should not be reached due to early return in caller
				return null

			default:
				return null
		}
	}

	/**
	 * Gets a user-friendly message for an issue type
	 */
	private static getIssueMessage(
		issueType: ValidationIssueType,
		nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
	): string {
		if (issueType === "inconsistent_pattern") {
			switch (nodePropertyType) {
				case "boolean":
					return "Not a boolean value (must be true/false)"
				case "integer":
					return "Not an integer value (must be a whole number)"
				case "float":
					return "Not a numeric value (must be a number)"
				case "date":
					return "Not a valid date format"
				case "datetime":
					return "Not a valid datetime format"
				case "string":
					return "Invalid value"
				case "list_string":
					return "Not a valid list of strings"
				default:
					return "Value does not match expected type"
			}
		}

		switch (issueType) {
			case "invalid_wikilink":
				return "Invalid wikilink format"
			case "non_existent_file":
				return "File does not exist"
			case "missing_mapping":
				return "Missing mapping configuration"
			default:
				return "Unknown issue"
		}
	}
}

