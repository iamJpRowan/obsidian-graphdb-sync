import type { FrontMatterValue } from "../../types"

/**
 * Extracts the filename without extension from a full path
 */
export function getFileName(path: string): string {
	const fileName = path.split(/[/\\]/).pop() || ""
	return fileName.replace(/\.md$/, "")
}

/**
 * Normalizes a file path by removing the vault path prefix
 */
export function normalizePath(filePath: string, vaultPath: string): string {
	return filePath
		.replace(vaultPath + "/", "")
		.replace(vaultPath + "\\", "")
}

/**
 * Converts a front matter value to the appropriate Neo4j type based on nodePropertyType
 * Returns null if conversion fails (value will be skipped)
 */
export function convertValueToNeo4jType(
	value: FrontMatterValue,
	nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
): unknown {
	// Handle null/undefined
	if (value === null || value === undefined) {
		return null
	}

	switch (nodePropertyType) {
		case "boolean":
			if (typeof value === "boolean") {
				return value
			}
			if (typeof value === "string") {
				const lower = value.toLowerCase().trim()
				if (lower === "true") return true
				if (lower === "false") return false
			}
			// Invalid boolean value - return null to skip
			return null

		case "integer":
			if (typeof value === "number") {
				return Number.isInteger(value) ? value : Math.floor(value)
			}
			if (typeof value === "string") {
				const num = Number(value.trim())
				if (!isNaN(num)) {
					return Math.floor(num)
				}
			}
			// Invalid integer value - return null to skip
			return null

		case "float":
			if (typeof value === "number") {
				return value
			}
			if (typeof value === "string") {
				const num = Number(value.trim())
				if (!isNaN(num)) {
					return num
				}
			}
			// Invalid float value - return null to skip
			return null

		case "date":
		case "datetime":
			// Neo4j date/datetime types accept ISO 8601 strings
			if (typeof value === "string") {
				const date = new Date(value.trim())
				if (!isNaN(date.getTime())) {
					// Return ISO 8601 string for Neo4j
					return date.toISOString()
				}
			}
			if (value instanceof Date) {
				return value.toISOString()
			}
			// Invalid date value - return null to skip
			return null

		case "string":
			// Convert any value to string
			if (typeof value === "string") {
				return value
			}
			if (Array.isArray(value)) {
				// Join array elements
				return value.map(String).join(", ")
			}
			return String(value)

		case "list_string":
			// Convert to array of strings
			if (Array.isArray(value)) {
				return value.map(String)
			}
			// Single value becomes single-element array
			return [String(value)]

		default:
			// Fallback to string
			return String(value)
	}
}

