// Property mapping configuration
export interface RelationshipMappingConfig {
	relationshipType: string
	direction: "outgoing" | "incoming"
}

// Node property mapping configuration
export interface NodePropertyMappingConfig {
	nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
	nodePropertyName: string
}

// Property mapping for a single property
export interface PropertyMapping {
	propertyName: string
	mappingType?: "relationship" | "node_property"
	config?: RelationshipMappingConfig | NodePropertyMappingConfig
	enabled: boolean
}

// Relationship type validation result
export interface RelationshipTypeValidation {
	isValid: boolean
	error?: string
}

export interface PluginSettings {
	neo4jUri: string
	neo4jUsername: string
	// Password is stored in session only (cleared when Obsidian closes)
	propertyMappings?: Record<string, PropertyMapping>
	labelRules?: LabelRule[]
	nodeLabelConfig?: NodeLabelConfig
	// Migration history (new - stores multiple results)
	migrationHistory?: MigrationHistoryEntry[]
	// Last migration result (kept for backward compatibility, derived from history)
	lastMigrationResult?: {
		success: boolean
		totalFiles: number
		successCount: number
		errorCount: number
		errors: Array<{ file: string; error: string } | { file: string; property: string; target: string; error: string }>
		duration: number
		message?: string
		relationshipStats?: {
			successCount: number
			errorCount: number
		}
		timestamp: number
	}
	lastAnalysisResult?: VaultAnalysisResult
}

export interface Neo4jCredentials {
	username: string
	password: string
}

// Node label configuration
export interface NodeLabelConfig {
	tags: string[]
	folders: string[]
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
	| { [key: string]: FrontMatterValue }

// Obsidian widget types (from metadataTypeManager)
export type ObsidianPropertyType =
	| "aliases"
	| "checkbox"
	| "date"
	| "datetime"
	| "multitext"
	| "number"
	| "tags"
	| "text"
	| "unknown"

// Property info for dashboard display
export interface PropertyInfo {
	name: string
	type: ObsidianPropertyType
	occurrences?: number
}

// Relationship mapping (includes property name and enabled flag)
export interface RelationshipMapping {
	propertyName: string
	relationshipType: string
	direction: "outgoing" | "incoming"
	enabled: boolean
}

// Validation issue types
export type ValidationIssueType =
	| "invalid_wikilink"
	| "non_existent_file"
	| "inconsistent_pattern"
	| "missing_mapping"

// Validation issue severity
export type ValidationIssueSeverity = "error" | "warning"

// Validation result
export interface ValidationResult {
	propertyName: string
	isValid: boolean
	issues: Array<{
		type: ValidationIssueType
		severity: ValidationIssueSeverity
		message: string
		count: number
	}>
	filesWithIssues: Array<{
		file: import("obsidian").TFile
		value: string
		issue: {
			type: ValidationIssueType
			severity: ValidationIssueSeverity
			message: string
			count: number
		}
	}>
}

// Error type categories
export type ErrorType =
	| "NETWORK"
	| "TRANSACTION"
	| "SOURCE_NODE_MISSING"
	| "TARGET_NODE_FAILURE"
	| "VALIDATION"
	| "INVALID_TYPE"
	| "QUERY_EXECUTION"
	| "UNKNOWN"

// Node creation error
export interface NodeCreationError {
	file: string
	error: string
	errorType: ErrorType
}

// Relationship creation error
export interface RelationshipCreationError {
	file: string
	property: string
	target: string
	error: string
	errorType: ErrorType
}

// Property error statistics
export interface PropertyErrorStats {
	propertyName: string
	successCount: number
	errorCount: number
	fileErrors: RelationshipCreationError[]
}

// Migration result
export interface MigrationResult {
	success: boolean
	totalFiles: number
	successCount: number
	errorCount: number
	duration: number
	message?: string
	phasesExecuted: Array<"nodes" | "relationships">
	nodeErrors: NodeCreationError[]
	relationshipErrors: RelationshipCreationError[]
	propertyStats: Record<string, PropertyErrorStats>
	relationshipStats: {
		successCount: number
		errorCount: number
	}
}

// Migration history entry (stored in settings)
export interface MigrationHistoryEntry {
	id: string // UUID or timestamp-based ID
	timestamp: number
	success: boolean
	totalFiles: number
	successCount: number
	errorCount: number
	duration: number
	message?: string
	phasesExecuted: Array<"nodes" | "relationships">
	// Summary errors (for quick display)
	errors: Array<{ file: string; error: string } | { file: string; property: string; target: string; error: string }>
	relationshipStats?: {
		successCount: number
		errorCount: number
	}
	// Detailed data (optional, stored for full details view)
	nodeErrors?: NodeCreationError[]
	relationshipErrors?: RelationshipCreationError[]
	propertyStats?: Record<string, PropertyErrorStats>
}

// Node property mapping
export interface NodePropertyMapping {
	propertyName: string
	nodePropertyType: "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string"
	nodePropertyName: string
	enabled: boolean
}

// Label rule (placeholder for future implementation)
export interface LabelRule {
	type: string
	pattern: string
	// TODO: Add more fields when label rules are implemented
	[key: string]: unknown
}
