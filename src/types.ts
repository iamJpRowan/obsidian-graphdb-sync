export interface PluginSettings {
	neo4jUri: string
	neo4jUsername: string
	// Password is stored in session only (cleared when Obsidian closes)
	lastMigrationResult?: {
		success: boolean
		totalFiles: number
		successCount: number
		errorCount: number
		errors: Array<{ file: string; error: string }>
		duration: number
		message?: string
		timestamp: number
	}
	lastAnalysisResult?: VaultAnalysisResult
}

export interface Neo4jCredentials {
	username: string
	password: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
	neo4jUri: "neo4j://localhost:7687",
	neo4jUsername: "neo4j",
}

// Property type detection
export type PropertyType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "array"
	| "object"
	| "null"
	| "mixed"

// Value pattern detection (for relationship mapping hints)
export type ValuePattern =
	| "wikilink" // [[Note Name]] - likely relationship target
	| "tag" // #tag format
	| "url" // http://...
	| "date-string" // ISO date or common formats
	| "numeric" // Numbers
	| "boolean" // true/false
	| "plain-text" // Regular text
	| "mixed" // Multiple patterns detected

// Wikilink validation result
export interface WikilinkValidation {
	isWikilink: boolean
	isValid: boolean
	linkText: string | null
	hasDisplayText: boolean
	fileExists: boolean | null // null if not checked
}

// Property validation issues
export interface PropertyValidationIssues {
	isFileProperty: boolean // Contains wikilinks (single or multi-file)
	isMultiFile: boolean // Array of files
	inconsistentPattern: boolean // Not all values are wikilinks
	invalidWikilinks: number // Count of invalid wikilinks
	nonExistentFiles: number // Count of wikilinks pointing to non-existent files
	validationDetails: Array<{
		value: string
		validation: WikilinkValidation
	}> // Sample validation details
	inconsistentSamples?: string[] // Sample values that are not wikilinks (when inconsistentPattern is true)
}

// Property statistics
export interface PropertyStats {
	name: string
	type: PropertyType
	frequency: number // How many files have this property
	frequencyPercent: number // Percentage of files
	valuePattern: ValuePattern
	sampleValues: string[] // Up to 5 sample values
	isArray: boolean
	arrayItemType?: PropertyType // If array, what type are items?
	arrayItemPattern?: ValuePattern // If array, what pattern?
	validation?: PropertyValidationIssues // Validation for file-related properties
}

// Analysis result
export interface VaultAnalysisResult {
	totalFiles: number
	filesWithFrontMatter: number
	properties: PropertyStats[]
	analysisDate: number // Timestamp
}

// Analysis progress (similar to MigrationProgress)
export interface AnalysisProgress {
	current: number
	total: number
	status: "scanning" | "analyzing" | "complete"
	currentFile?: string
}

export type AnalysisProgressCallback = (progress: AnalysisProgress) => void

// Front matter value types (YAML front matter can contain these types)
export type FrontMatterValue =
	| string
	| number
	| boolean
	| null
	| FrontMatterValue[]
	| Record<string, FrontMatterValue>
