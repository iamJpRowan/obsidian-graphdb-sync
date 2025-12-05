import type { ValuePattern, FrontMatterValue } from "../../types"

/**
 * Detects patterns in values that suggest relationship candidates
 */
export function detectValuePattern(value: FrontMatterValue): ValuePattern {
	if (typeof value !== "string") {
		if (typeof value === "number") {
			return "numeric"
		}
		if (typeof value === "boolean") {
			return "boolean"
		}
		return "plain-text"
	}

	const str = value as string

	// Check for wikilinks: [[Note Name]] or [[Note Name|Display]]
	if (/\[\[([^\]]+)\]\]/.test(str)) {
		return "wikilink"
	}

	// Check for tags: #tag or #tag/subtag
	if (/^#[\w/-]+$/.test(str)) {
		return "tag"
	}

	// Check for URLs
	if (
		/^https?:\/\/.+/.test(str) ||
		/^[a-z]+:\/\/.+/.test(str)
	) {
		return "url"
	}

	// Check for date strings (ISO format or common formats)
	if (
		/^\d{4}-\d{2}-\d{2}/.test(str) || // ISO date
		/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str) || // MM/DD/YYYY
		/^\d{4}\/\d{2}\/\d{2}/.test(str) // YYYY/MM/DD
	) {
		// Try to parse as date to confirm
		const date = new Date(str)
		if (!isNaN(date.getTime())) {
			return "date-string"
		}
	}

	// Check for numeric strings
	if (/^-?\d+(\.\d+)?$/.test(str)) {
		return "numeric"
	}

	return "plain-text"
}

