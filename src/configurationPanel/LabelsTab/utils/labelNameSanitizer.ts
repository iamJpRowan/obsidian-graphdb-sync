/**
 * Sanitizes label name input according to Neo4j naming conventions
 * - Must start with a letter
 * - Can contain letters, numbers, and underscores
 * - Spaces are converted to underscores
 * @param value - Input value
 * @param cursorPosition - Current cursor position
 * @returns Object with sanitized value and new cursor position
 */
export interface SanitizeResult {
	value: string
	cursorPosition: number
}

export function sanitizeLabelName(
	value: string,
	cursorPosition: number
): SanitizeResult {
	// Track how many invalid chars were before cursor to adjust position
	let invalidCharsBeforeCursor = 0
	for (let i = 0; i < Math.min(cursorPosition, value.length); i++) {
		if (i === 0) {
			// First character must be a letter
			if (!/[A-Za-z]/.test(value[i])) {
				invalidCharsBeforeCursor++
			}
		} else {
			// Subsequent characters: alphanumeric or underscore
			if (!/[A-Z0-9_]/i.test(value[i])) {
				invalidCharsBeforeCursor++
			}
		}
	}

	// Clean: first char must be letter, rest alphanumeric/underscore
	let corrected = value
	// Remove invalid chars after first position
	corrected = corrected[0]?.match(/[A-Za-z]/)
		? corrected[0] + corrected.substring(1).replace(/[^A-Z0-9_]/gi, "")
		: corrected.replace(/[^A-Za-z]/gi, "")

	// Calculate new cursor position
	const newCursorPosition = Math.max(
		0,
		Math.min(cursorPosition - invalidCharsBeforeCursor, corrected.length)
	)

	return {
		value: corrected,
		cursorPosition: newCursorPosition,
	}
}

/**
 * Cleans up a label name by collapsing multiple underscores and removing leading/trailing underscores
 * @param labelName - Label name to clean
 * @returns Cleaned label name
 */
export function cleanLabelName(labelName: string): string {
	return labelName
		.replace(/_+/g, "_") // Collapse multiple underscores
		.replace(/^_|_$/g, "") // Remove leading/trailing underscores
}

