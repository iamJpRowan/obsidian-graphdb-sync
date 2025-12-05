import type { App } from "obsidian"
import type {
	PropertyStats,
	PropertyType,
	ValuePattern,
	FrontMatterValue,
} from "../../types"
import { detectPropertyType } from "./typeDetection"
import { detectValuePattern } from "./patternDetection"
import { validateFileProperty } from "./validation"

/**
 * Analyzes a property across all files to generate statistics
 */
export function analyzeProperty(
	propertyName: string,
	values: FrontMatterValue[],
	totalFiles: number
): PropertyStats {
	// Filter out null/undefined values for analysis
	const nonNullValues = values.filter(
		(v) => v !== null && v !== undefined
	)

	if (nonNullValues.length === 0) {
		return {
			name: propertyName,
			type: "null",
			frequency: 0,
			frequencyPercent: 0,
			valuePattern: "plain-text",
			sampleValues: [],
			isArray: false,
		}
	}

	// Detect if this is primarily an array property
	const arrayCount = nonNullValues.filter(Array.isArray).length
	const isArray = arrayCount > nonNullValues.length / 2

	// Determine primary type
	const types = nonNullValues.map(detectPropertyType)
	const typeCounts = new Map<PropertyType, number>()
	types.forEach((type) => {
		typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
	})

	let primaryType: PropertyType = "mixed"
	let maxCount = 0
	typeCounts.forEach((count, type) => {
		if (count > maxCount) {
			maxCount = count
			primaryType = type
		}
	})

	// If mixed types, check if it's mostly one type
	if (primaryType === "mixed" && maxCount / nonNullValues.length > 0.8) {
		// Recalculate with most common type
		typeCounts.forEach((count, type) => {
			if (count === maxCount && type !== "mixed") {
				primaryType = type
			}
		})
	}

	// Analyze value patterns
	const patternCounts = new Map<ValuePattern, number>()
	let arrayItemType: PropertyType | undefined
	let arrayItemPattern: ValuePattern | undefined

	if (isArray) {
		// Analyze array items
		const arrayItems: FrontMatterValue[] = []
		nonNullValues.forEach((val) => {
			if (Array.isArray(val)) {
				arrayItems.push(...val)
			}
		})

		if (arrayItems.length > 0) {
			const itemTypes = arrayItems.map(detectPropertyType)
			const itemTypeCounts = new Map<PropertyType, number>()
			itemTypes.forEach((type) => {
				itemTypeCounts.set(type, (itemTypeCounts.get(type) || 0) + 1)
			})

			let maxItemCount = 0
			itemTypeCounts.forEach((count, type) => {
				if (count > maxItemCount) {
					maxItemCount = count
					arrayItemType = type
				}
			})

			// Detect pattern in array items
			const itemPatterns = arrayItems.map(detectValuePattern)
			const itemPatternCounts = new Map<ValuePattern, number>()
			itemPatterns.forEach((pattern) => {
				itemPatternCounts.set(
					pattern,
					(itemPatternCounts.get(pattern) || 0) + 1
				)
			})

			let maxPatternCount = 0
			itemPatternCounts.forEach((count, pattern) => {
				if (count > maxPatternCount) {
					maxPatternCount = count
					arrayItemPattern = pattern
				}
			})
		}

		// For arrays, analyze the array items themselves for patterns
		nonNullValues.forEach((val) => {
			if (Array.isArray(val)) {
				val.forEach((item) => {
					const pattern = detectValuePattern(item)
					patternCounts.set(
						pattern,
						(patternCounts.get(pattern) || 0) + 1
					)
				})
			}
		})
	} else {
		// Analyze non-array values for patterns
		nonNullValues.forEach((val) => {
			if (!Array.isArray(val)) {
				const pattern = detectValuePattern(val)
				patternCounts.set(
					pattern,
					(patternCounts.get(pattern) || 0) + 1
				)
			}
		})
	}

	// Determine primary pattern
	let primaryPattern: ValuePattern = "plain-text"
	let maxPatternCount = 0
	patternCounts.forEach((count, pattern) => {
		if (count > maxPatternCount) {
			maxPatternCount = count
			primaryPattern = pattern
		}
	})

	// Collect sample values (up to 5 unique)
	const sampleValues: string[] = []
	const seenValues = new Set<string>()

	const addSample = (val: FrontMatterValue) => {
		if (sampleValues.length >= 5) return

		let strValue: string
		if (Array.isArray(val)) {
			strValue = `[${val.slice(0, 3).join(", ")}${
				val.length > 3 ? "..." : ""
			}]`
		} else if (typeof val === "object") {
			strValue = JSON.stringify(val).slice(0, 50)
		} else {
			strValue = String(val).slice(0, 100)
		}

		if (!seenValues.has(strValue)) {
			seenValues.add(strValue)
			sampleValues.push(strValue)
		}
	}

	// Collect samples from non-null values
	nonNullValues.slice(0, 20).forEach(addSample)

	return {
		name: propertyName,
		type: primaryType,
		frequency: nonNullValues.length,
		frequencyPercent: (nonNullValues.length / totalFiles) * 100,
		valuePattern: primaryPattern,
		sampleValues,
		isArray,
		arrayItemType,
		arrayItemPattern,
	}
}

/**
 * Aggregates property data and generates statistics
 */
export function aggregateProperties(
	propertyData: Map<string, FrontMatterValue[]>,
	totalFiles: number,
	app?: App
): PropertyStats[] {
	const stats: PropertyStats[] = []

	propertyData.forEach((values, propertyName) => {
		const stat = analyzeProperty(propertyName, values, totalFiles)
		
		// Add validation for file-related properties if app is provided
		if (app && (stat.valuePattern === "wikilink" || stat.arrayItemPattern === "wikilink")) {
			const validation = validateFileProperty(
				propertyName,
				values,
				app,
				stat.isArray
			)
			if (validation) {
				stat.validation = validation
			}
		}
		
		stats.push(stat)
	})

	// Sort by frequency (most common first)
	stats.sort((a, b) => b.frequency - a.frequency)

	return stats
}

