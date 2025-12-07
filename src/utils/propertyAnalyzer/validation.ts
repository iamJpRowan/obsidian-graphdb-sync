import type { App } from "obsidian"
import type {
	WikilinkValidation,
	PropertyValidationIssues,
	FrontMatterValue,
} from "../../types"

/**
 * Validates a wikilink value
 */
export function validateWikilink(
	value: FrontMatterValue,
	app: App
): WikilinkValidation {
	if (typeof value !== "string") {
		return {
			isWikilink: false,
			isValid: false,
			linkText: null,
			hasDisplayText: false,
			fileExists: null,
		}
	}

	const str = value as string
	const wikilinkRegex = /\[\[([^\]]+)\]\]/
	const match = str.match(wikilinkRegex)

	if (!match) {
		return {
			isWikilink: false,
			isValid: false,
			linkText: null,
			hasDisplayText: false,
			fileExists: null,
		}
	}

	const linkContent = match[1]
	const hasDisplayText = linkContent.includes("|")
	const linkText = hasDisplayText
		? linkContent.split("|")[0].trim()
		: linkContent.trim()

	// Check if file exists
	let fileExists: boolean | null = null
	if (linkText) {
		// Try to find the file - check both exact match and with .md extension
		const files = app.vault.getMarkdownFiles()
		fileExists =
			files.some(
				(f) =>
					f.path === linkText ||
					f.path === `${linkText}.md` ||
					f.basename === linkText
			) || false
	}

	return {
		isWikilink: true,
		isValid: !!linkText,
		linkText,
		hasDisplayText,
		fileExists,
	}
}

/**
 * Validates file-related properties
 */
export function validateFileProperty(
	propertyName: string,
	values: FrontMatterValue[],
	app: App,
	isArray: boolean
): PropertyValidationIssues | undefined {
	const nonNullValues = values.filter(
		(v) => v !== null && v !== undefined
	)

	if (nonNullValues.length === 0) {
		return undefined
	}

	// Check if this property contains wikilinks
	let wikilinkCount = 0
	let invalidWikilinkCount = 0
	let nonExistentFileCount = 0
	const validationDetails: Array<{
		value: string
		validation: WikilinkValidation
	}> = []
	const inconsistentSamples: string[] = []

	// Process values based on whether it's an array property
	if (isArray) {
		// For arrays, check each item
		nonNullValues.forEach((val) => {
			if (Array.isArray(val)) {
				val.forEach((item) => {
					// Only validate string items
					if (typeof item === "string") {
						const validation = validateWikilink(item, app)
						if (validation.isWikilink) {
							wikilinkCount++
							if (!validation.isValid) {
								invalidWikilinkCount++
							}
							if (validation.fileExists === false) {
								nonExistentFileCount++
							}
							// Collect sample validation details (up to 10)
							if (validationDetails.length < 10) {
								validationDetails.push({
									value: item,
									validation,
								})
							}
						} else {
							// Not a wikilink - collect as inconsistent sample (up to 10)
							if (inconsistentSamples.length < 10) {
								inconsistentSamples.push(item)
							}
						}
					}
				})
			}
		})
	} else {
		// For single values, check each value
		nonNullValues.forEach((val) => {
			// Only validate string values
			if (typeof val === "string") {
				const validation = validateWikilink(val, app)
				if (validation.isWikilink) {
					wikilinkCount++
					if (!validation.isValid) {
						invalidWikilinkCount++
					}
					if (validation.fileExists === false) {
						nonExistentFileCount++
					}
					// Collect sample validation details (up to 10)
					if (validationDetails.length < 10) {
						validationDetails.push({
							value: val,
							validation,
						})
					}
				} else {
					// Not a wikilink - collect as inconsistent sample (up to 10)
					if (inconsistentSamples.length < 10) {
						inconsistentSamples.push(val)
					}
				}
			}
		})
	}

	// Only return validation if this is a file property (has wikilinks)
	if (wikilinkCount === 0) {
		return undefined
	}

	// Check for inconsistent patterns (not all values are wikilinks)
	const totalValuesChecked = isArray
		? nonNullValues.reduce<number>(
				(sum, val) =>
					sum + (Array.isArray(val) ? val.length : 0),
				0
		  )
		: nonNullValues.length

	const inconsistentPattern =
		wikilinkCount > 0 && wikilinkCount < totalValuesChecked

	return {
		isFileProperty: true,
		isMultiFile: isArray,
		inconsistentPattern,
		invalidWikilinks: invalidWikilinkCount,
		nonExistentFiles: nonExistentFileCount,
		validationDetails,
		inconsistentSamples:
			inconsistentPattern && inconsistentSamples.length > 0
				? inconsistentSamples
				: undefined,
	}
}

