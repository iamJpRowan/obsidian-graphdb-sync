import { setIcon } from "obsidian"
import type { PropertyType } from "../../types"

/**
 * Gets the Lucide icon name for a property type
 */
export function getPropertyTypeIcon(
	type: PropertyType,
	isFileProperty?: boolean,
	isMultiFile?: boolean
): string {
	if (isFileProperty) {
		return isMultiFile ? "file-stack" : "file-text"
	}
	
	switch (type) {
		case "string":
			return "type"
		case "number":
			return "hash"
		case "boolean":
			return "toggle-left"
		case "date":
			return "calendar"
		case "array":
			return "list"
		case "object":
			return "braces"
		case "null":
			return "circle-slash"
		case "mixed":
			return "shuffle"
		default:
			return "help-circle"
	}
}

/**
 * Creates just the type icon
 */
export function createTypeIcon(
	container: HTMLElement,
	type: PropertyType,
	isArray: boolean,
	arrayItemType?: PropertyType,
	isFileProperty?: boolean,
	isMultiFile?: boolean
): HTMLElement {
	const iconEl = container.createSpan("graphdb-analysis-type-icon")
	const iconType = isArray && arrayItemType ? arrayItemType : type
	setIcon(iconEl, getPropertyTypeIcon(iconType, isFileProperty, isMultiFile))
	return iconEl
}

/**
 * Gets the type name as a string
 */
export function getTypeName(
	type: PropertyType,
	isArray: boolean,
	arrayItemType?: PropertyType
): string {
	if (isArray && arrayItemType) {
		return `array<${arrayItemType}>`
	}
	return type
}

