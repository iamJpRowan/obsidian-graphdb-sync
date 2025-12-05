import type { PropertyType, FrontMatterValue } from "../../types"

/**
 * Detects the type of a property value
 */
export function detectPropertyType(value: FrontMatterValue): PropertyType {
	if (value === null || value === undefined) {
		return "null"
	}

	if (Array.isArray(value)) {
		return "array"
	}

	if (typeof value === "object") {
		return "object"
	}

	if (typeof value === "string") {
		return "string"
	}

	if (typeof value === "number") {
		return "number"
	}

	if (typeof value === "boolean") {
		return "boolean"
	}

	return "mixed"
}

