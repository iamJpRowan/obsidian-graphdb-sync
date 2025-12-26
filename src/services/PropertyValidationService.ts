import type { App } from "obsidian"
import { validateFileProperty } from "../utils/propertyAnalyzer/validation"
import { extractFrontMatter } from "../utils/frontMatterExtractor"
import type { ValidationResult, ValidationIssueType, ValidationIssueSeverity, FrontMatterValue } from "../types"

/**
 * Simplified validation service
 * On-demand validation for individual properties
 */
export class PropertyValidationService {
	/**
	 * Validates a single property
	 * Returns validation results with issues and file details
	 */
	static async validateProperty(
		app: App,
		propertyName: string
	): Promise<ValidationResult> {
		const markdownFiles = app.vault.getMarkdownFiles()
		const values: FrontMatterValue[] = []
		const filesWithProperty: string[] = []

		// Collect all values for this property
		for (const file of markdownFiles) {
			const frontMatter = extractFrontMatter(app, file)
			if (frontMatter && propertyName in frontMatter) {
				values.push(frontMatter[propertyName])
				filesWithProperty.push(file.path)
			}
		}

		// Check if property might have wikilinks (simple check)
		const hasStringValues = values.some(v => typeof v === "string")
		if (!hasStringValues) {
			return {
				propertyName,
				isValid: true,
				issues: [],
				filesWithIssues: [],
			}
		}

		// Validate if it's a file-related property (wikilinks)
		const validation = validateFileProperty(propertyName, values, app, false)

		if (validation && (validation.invalidWikilinks > 0 || validation.nonExistentFiles > 0 || validation.inconsistentPattern)) {
			// Convert to simplified ValidationResult
			const issues: ValidationResult["issues"] = []

			if (validation.invalidWikilinks > 0) {
				issues.push({
					type: "invalid_wikilink" as ValidationIssueType,
					severity: "error" as ValidationIssueSeverity,
					message: `${validation.invalidWikilinks} invalid wikilink(s)`,
					count: validation.invalidWikilinks,
				})
			}

			if (validation.nonExistentFiles > 0) {
				issues.push({
					type: "non_existent_file" as ValidationIssueType,
					severity: "error" as ValidationIssueSeverity,
					message: `${validation.nonExistentFiles} wikilink(s) point to non-existent files`,
					count: validation.nonExistentFiles,
				})
			}

			if (validation.inconsistentPattern) {
				issues.push({
					type: "inconsistent_pattern" as ValidationIssueType,
					severity: "warning" as ValidationIssueSeverity,
					message: "Property contains both wikilinks and non-wikilink values",
					count: validation.inconsistentSamples?.length || 0,
				})
			}

			// Get files with issues (simplified - would need better file tracking)
			const filesWithIssues: ValidationResult["filesWithIssues"] = []
			if (validation.validationDetails) {
				for (let i = 0; i < Math.min(validation.validationDetails.length, filesWithProperty.length); i++) {
					const detail = validation.validationDetails[i]
					if (!detail.validation.isValid || detail.validation.fileExists === false) {
						const issue = issues.find(iss => 
							(detail.validation.isValid === false && iss.type === "invalid_wikilink") ||
							(detail.validation.fileExists === false && iss.type === "non_existent_file")
						) || issues[0]
						
						if (issue) {
							filesWithIssues.push({
								filePath: filesWithProperty[i] || "",
								value: detail.value,
								issue,
							})
						}
					}
				}
			}

			return {
				propertyName,
				isValid: issues.length === 0,
				issues,
				filesWithIssues,
			}
		}

		// No validation issues
		return {
			propertyName,
			isValid: true,
			issues: [],
			filesWithIssues: [],
		}
	}
}
