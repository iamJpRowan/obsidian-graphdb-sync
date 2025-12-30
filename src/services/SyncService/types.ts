import type { App } from "obsidian"
import type {
	Neo4jCredentials,
	PluginSettings,
	NodeCreationError,
	RelationshipCreationError,
	PropertyErrorStats,
} from "../../types"

/**
 * Sync progress information
 */
export interface SyncProgress {
	current: number
	total: number
	status: "scanning" | "connecting" | "creating_nodes" | "updating_properties" | "creating_relationships"
	currentFile?: string
}

/**
 * Callback for progress updates
 */
export type ProgressCallback = (progress: SyncProgress) => void

/**
 * Options for sync operations
 */
export interface SyncOptions {
	/** Optional list of node property names to sync (only these will be synced) */
	nodePropertyFilter?: string[]
	/** Optional list of relationship property names to sync (only these will be synced) */
	relationshipPropertyFilter?: string[]
}

/**
 * Context required for sync operations
 */
export interface SyncContext {
	vaultPath: string
	uri: string
	credentials: Neo4jCredentials
	app: App
	settings: PluginSettings
	onProgress: ProgressCallback
}

/**
 * Result of a node sync operation
 */
export interface NodeSyncResult {
	success: boolean
	successCount: number
	errorCount: number
	nodeErrors: NodeCreationError[]
	duration: number
	message?: string
}

/**
 * Result of a relationship sync operation
 */
export interface RelationshipSyncResult {
	successCount: number
	errorCount: number
	errors: RelationshipCreationError[]
	propertyStats: Record<string, PropertyErrorStats>
}

