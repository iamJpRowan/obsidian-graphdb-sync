import type { App } from "obsidian"
import { extractFrontMatter } from "../utils/frontMatterExtractor"
import { validateWikilink } from "../utils/propertyAnalyzer/validation"
import type { ValidationResult, ValidationIssueType, ValidationIssueSeverity, FrontMatterValue } from "../types"

/**
 * Validation service for relationship mappings
 * Checks for data that will fail during sync/migration
 */
export class RelationshipValidationService {
	/**
	 * Validates a property configured as a relationship mapping
	 * Returns validation results with issues and file details
	 * 
	 * Issues checked:
	 * - Non-wikilink values (will fail during sync)
	 * - Invalid wikilink format (malformed)
	 * - Files not existing is NOT treated as an issue (per requirements)
	 */
	static async validateRelationshipProperty(
		app: App,
		propertyName: string
	): Promise<ValidationResult> {
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

			// Handle array values (multitext properties)
			if (Array.isArray(value)) {
				for (const item of value) {
					// Skip null/undefined values - they won't cause sync issues
					if (item === null || item === undefined) {
						continue
					}
					const issue = this.validateValue(item, app)
					if (issue) {
						issueCounts[issue]++
						filesWithIssues.push({
							file,
							value: String(item),
							issue: {
								type: issue,
								severity: "error" as ValidationIssueSeverity,
								message: this.getIssueMessage(issue),
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
				const issue = this.validateValue(value, app)
				if (issue) {
					issueCounts[issue]++
					filesWithIssues.push({
						file,
						value: String(value),
						issue: {
							type: issue,
							severity: "error" as ValidationIssueSeverity,
							message: this.getIssueMessage(issue),
							count: issueCounts[issue],
						},
					})
				}
			}
		}

		// Build issues array
		const issues: ValidationResult["issues"] = []
		if (issueCounts.invalid_wikilink > 0) {
			issues.push({
				type: "invalid_wikilink",
				severity: "error",
				message: `${issueCounts.invalid_wikilink} invalid wikilink(s) found`,
				count: issueCounts.invalid_wikilink,
			})
		}
		if (issueCounts.inconsistent_pattern > 0) {
			issues.push({
				type: "inconsistent_pattern",
				severity: "error",
				message: `${issueCounts.inconsistent_pattern} non-wikilink value(s) found`,
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
	 * Validates a single value
	 * Returns issue type if validation fails, null if valid
	 */
	private static validateValue(
		value: FrontMatterValue,
		app: App
	): ValidationIssueType | null {
		// Skip null/undefined - already handled by caller, but double-check
		if (value === null || value === undefined) {
			return null
		}
		
		// Only validate string values
		if (typeof value !== "string") {
			return "inconsistent_pattern" // Non-string values are not wikilinks
		}

		const validation = validateWikilink(value, app)

		// If it's not a wikilink at all, that's an issue
		if (!validation.isWikilink) {
			return "inconsistent_pattern"
		}

		// If it's a wikilink but invalid format, that's an issue
		if (!validation.isValid) {
			return "invalid_wikilink"
		}

		// File not existing is NOT treated as an issue (per requirements)
		// So we return null if it's a valid wikilink, regardless of file existence

		return null
	}

	/**
	 * Gets a user-friendly message for an issue type
	 */
	private static getIssueMessage(issueType: ValidationIssueType): string {
		switch (issueType) {
			case "invalid_wikilink":
				return "Invalid wikilink format"
			case "inconsistent_pattern":
				return "Not a wikilink (will fail during sync)"
			case "non_existent_file":
				return "File does not exist"
			case "missing_mapping":
				return "Missing mapping configuration"
			default:
				return "Unknown issue"
		}
	}
}

