import type { App } from "obsidian"
import type { FrontMatterValue } from "../types"
import { validateWikilink } from "./propertyAnalyzer/validation"

/**
 * Extracts wikilink targets from a front matter value and resolves them to file paths
 * Handles both single values and arrays, and includes non-existent files in the result
 * @param value - Front matter value (string, array, or other)
 * @param app - Obsidian app instance for file resolution
 * @returns Array of resolved file paths (empty if no valid wikilinks found)
 */
export function extractWikilinkTargets(
	value: FrontMatterValue,
	app: App
): string[] {
	const targets: string[] = []

	// Handle arrays
	if (Array.isArray(value)) {
		value.forEach((item) => {
			if (typeof item === "string") {
				const validation = validateWikilink(item, app)
				if (validation.isWikilink && validation.isValid && validation.linkText) {
					const resolvedPath = resolveWikilinkToPath(validation.linkText, app)
					if (resolvedPath) {
						targets.push(resolvedPath)
					} else {
						// Include non-existent files - use the linkText as path
						// This allows migration to create nodes for missing files
						targets.push(validation.linkText)
					}
				}
				// Skip invalid wikilinks (malformed syntax)
			}
		})
	}
	// Handle single string values
	else if (typeof value === "string") {
		const validation = validateWikilink(value, app)
		if (validation.isWikilink && validation.isValid && validation.linkText) {
			const resolvedPath = resolveWikilinkToPath(validation.linkText, app)
			if (resolvedPath) {
				targets.push(resolvedPath)
			} else {
				// Include non-existent files - use the linkText as path
				targets.push(validation.linkText)
			}
		}
		// Skip invalid wikilinks (malformed syntax)
	}

	return targets
}

/**
 * Resolves a wikilink text to an actual file path
 * @param linkText - The text content of the wikilink (without brackets)
 * @param app - Obsidian app instance
 * @returns Resolved file path or null if file doesn't exist
 */
function resolveWikilinkToPath(linkText: string, app: App): string | null {
	const markdownFiles = app.vault.getMarkdownFiles()

	// Try to find matching file
	const matchedFile = markdownFiles.find(
		(file) =>
			file.path === linkText ||
			file.path === `${linkText}.md` ||
			file.basename === linkText
	)

	return matchedFile ? matchedFile.path : null
}







