// Property mapping configuration
export interface RelationshipMappingConfig {
	relationshipType: string
	direction: "outgoing" | "incoming"
}

// Node property mapping configuration (placeholder for future implementation)
export interface NodePropertyMappingConfig {
	// TODO: Define structure when node property feature is implemented
	[key: string]: unknown
}

// Property mapping for a single property
export interface PropertyMapping {
	propertyName: string
	mappingType?: "relationship" | "node_property"
	config?: RelationshipMappingConfig | NodePropertyMappingConfig
	enabled: boolean
}

// Relationship error for detailed error reporting (deprecated - use RelationshipCreationError)
export interface RelationshipError {
	file: string
	property: string
	target: string
	error: string
}

// Relationship type validation result
export interface RelationshipTypeValidation {
	isValid: boolean
	error?: string
}

// Error type categories for error classification
export type ErrorType =
	| "SOURCE_NODE_MISSING" // Source node doesn't exist when creating relationships
	| "TARGET_NODE_FAILURE" // Target node creation failures
	| "QUERY_EXECUTION" // Neo4j query execution errors
	| "VALIDATION" // Validation failures (empty relationship type, invalid format)
	| "TRANSACTION" // Transaction commit failures
	| "NETWORK" // Network/connection errors
	| "INVALID_TYPE" // Invalid property value types
	| "UNKNOWN" // Catch-all for unclassified errors

// Node creation error
export interface NodeCreationError {
	file: string // Relative file path
	error: string // Error message
	errorType: ErrorType // Categorized error type
}

// Relationship creation error
export interface RelationshipCreationError {
	file: string // Relative file path (source file)
	property: string // Property name that caused the error
	target: string // Target file path (for relationship target)
	error: string // Error message
	errorType: ErrorType // Categorized error type
}

// Property write error (for writing property values to nodes, not relationships)
export interface PropertyWriteError {
	file: string // Relative file path
	property: string // Property name
	error: string // Error message
	errorType: ErrorType // Categorized error type
}

// Property-level error statistics
// fileErrors can contain relationship errors (for relationship mappings) or property write errors (for node property mappings)
export interface PropertyErrorStats {
	propertyName: string // Property name
	successCount: number // Number of successful operations for this property
	errorCount: number // Total number of errors for this property
	fileErrors: Array<RelationshipCreationError | PropertyWriteError> // Errors for this property (relationship or property write)
}

// Migration phases that were executed
export type MigrationPhase = "nodes" | "relationships"

// Migration result with comprehensive error reporting
export interface MigrationResult {
	success: boolean
	totalFiles: number
	successCount: number // Node creation success count
	errorCount: number // Total error count (sum of all error arrays)
	duration: number
	message?: string
	timestamp?: number // Timestamp when migration completed
	
	// Phase tracking
	phasesExecuted: MigrationPhase[] // Which phases were executed
	
	// Categorized error arrays
	nodeErrors: NodeCreationError[] // Errors during node creation
	relationshipErrors: RelationshipCreationError[] // Errors during relationship creation
	propertyWriteErrors: PropertyWriteError[] // Errors during property write operations (node properties)
	
	// Property-level statistics
	propertyStats: Record<string, PropertyErrorStats> // Key: property name, Value: error stats
	
	// Legacy relationship stats (for backward compatibility during transition)
	relationshipStats?: {
		successCount: number
		errorCount: number
	}
}

export interface PluginSettings {
	neo4jUri: string
	neo4jUsername: string
	// Password is stored in session only (cleared when Obsidian closes)
	propertyMappings?: Record<string, PropertyMapping>
	lastMigrationResult?: MigrationResult
	lastAnalysisResult?: VaultAnalysisResult
	nodeLabelConfig?: NodeLabelConfig
	labelRules?: LabelRule[] // New: Label rules configuration
	propertyMigrationHistory?: Record<string, PropertyMigrationHistory> // New: Per-property migration history
}

export interface Neo4jCredentials {
	username: string
	password: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
	neo4jUri: "neo4j://localhost:7687",
	neo4jUsername: "neo4j",
}

// Property widget type from Obsidian metadataTypeManager
export type PropertyType =
	| "aliases"
	| "checkbox"
	| "date"
	| "datetime"
	| "multitext"
	| "number"
	| "tags"
	| "text"
	| "unknown"

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

// Node label configuration
export interface NodeLabelConfig {
	tags: string[] // Tags that determine node labels
	folders: string[] // Folders that determine node labels
}

// Validation issue types
export type ValidationIssueType =
	| "invalid_wikilink"
	| "non_existent_file"
	| "inconsistent_pattern"
	| "missing_mapping"

// Validation issue severity
export type ValidationIssueSeverity = "error" | "warning"

// Validation issue
export interface ValidationIssue {
	type: ValidationIssueType
	severity: ValidationIssueSeverity
	message: string
	count: number
}

// File issue (specific file with a validation problem)
export interface FileIssue {
	filePath: string
	value: string
	issue: ValidationIssue
}

// Property validation result
export interface PropertyValidationResult {
	propertyName: string
	isValid: boolean
	issues: ValidationIssue[]
	filesWithIssues: FileIssue[]
}

// Validation summary for multiple properties
export interface ValidationSummary {
	totalProperties: number
	validProperties: number
	propertiesWithIssues: number
	results: Record<string, PropertyValidationResult>
}

// Property state (complete state for UI)
export interface PropertyState {
	property: PropertyStats
	mapping: PropertyMapping | null
	validation: PropertyValidationResult | null
	migrationStats: PropertyErrorStats | null
	hasWikilinks: boolean
	hasErrors: boolean
	hasValidationIssues: boolean
	isMapped: boolean
	isEnabled: boolean
}

// Property filter criteria
export interface PropertyFilter {
	mapped?: boolean
	unmapped?: boolean
	hasWikilinks?: boolean
	hasErrors?: boolean
	hasValidationIssues?: boolean
	enabled?: boolean
	search?: string
}

// Property statistics
export interface PropertyStatistics {
	total: number
	mapped: number
	enabled: number
	withErrors: number
	withValidationIssues: number
	withWikilinks: number
}

// Mapping validation result
export interface MappingValidationResult {
	isValid: boolean
	errors: string[]
	warnings: string[]
}

// ============================================================================
// NEW SIMPLIFIED TYPES FOR V2 UI
// ============================================================================

/**
 * Simplified property information for UI display
 */
export interface PropertyInfo {
	name: string
	type: PropertyType
	occurrences?: number
}

/**
 * Relationship mapping configuration
 */
export interface RelationshipMapping {
	propertyName: string
	relationshipType: string
	direction: "outgoing" | "incoming"
	enabled: boolean
}

/**
 * Node property mapping configuration
 */
export interface NodePropertyMapping {
	propertyName: string
	enabled: boolean
}

/**
 * Label rule for assigning labels to nodes
 */
export interface LabelRule {
	type: "tag" | "folder"
	pattern: string // e.g., "#project-*" or "folder/path" or exact match
	labelName: string // Neo4j label name
	enabled: boolean
}

/**
 * Simplified validation result
 */
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
		filePath: string
		value: string
		issue: {
			type: ValidationIssueType
			severity: ValidationIssueSeverity
			message: string
			count: number
		}
	}>
}

/**
 * Per-property migration history
 */
export interface PropertyMigrationHistory {
	propertyName: string
	migrations: Array<{
		timestamp: number
		strategy: "full" | "property_only" | "labels_only"
		success: boolean
		errorCount: number
		successCount: number
	}>
}
