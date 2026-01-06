import type { Driver, Session } from "neo4j-driver"
import type { MigrationResult, RelationshipPropertyCounts } from "../../types"
import { ConfigurationService } from "../ConfigurationService"
import { SyncInfrastructure } from "./infrastructure"
import { syncNodeProperties } from "./operations/nodeSync"
import { syncRelationships } from "./operations/relationshipSync"
import { syncLabelsWithSession } from "./operations/labelSync"
import type { SyncContext, SyncOptions, SyncProgress } from "./types"
import { StateService } from "../StateService"

/**
 * Syncs node properties only
 */
export async function syncNodePropertiesOnly(context: SyncContext, options?: SyncOptions): Promise<MigrationResult> {
	if (SyncInfrastructure.getCurrentSync()) {
		throw new Error("Sync already in progress")
	}

	const startTime = Date.now()
	SyncInfrastructure.initializeSync()

	let driver: Driver | null = null
	let session: Session | null = null

	try {
		// Scanning progress
		const scanningProgress: SyncProgress = {
			current: 0,
			total: 0,
			status: "scanning",
		}
		context.onProgress(scanningProgress)
		StateService.setMigrationState({ progress: scanningProgress })

		// Find all markdown files
		const files = await SyncInfrastructure.findMarkdownFiles(context.vaultPath)

		if (files.length === 0) {
			SyncInfrastructure.clearSync()
			return {
				success: true,
				totalFiles: 0,
				successCount: 0,
				errorCount: 0,
				duration: Date.now() - startTime,
				message: "No markdown files found",
				phasesExecuted: [],
				nodeErrors: [],
				relationshipErrors: [],
				propertyStats: {},
				relationshipStats: {
					successCount: 0,
					errorCount: 0,
				},
			}
		}

		// Connect to Neo4j
		const connection = await SyncInfrastructure.connect(context.uri, context.credentials, context.onProgress)
		driver = connection.driver
		session = connection.session

		// Initialize property stats (empty for node-only sync)
		const propertyStats: Record<string, RelationshipPropertyCounts> = {}

		// Sync node properties
		const nodeResult = await syncNodeProperties(
			session,
			context.vaultPath,
			files,
			context.onProgress,
			context.app,
			context.settings,
			options?.nodePropertyFilter
		)

		// Cleanup
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		return {
			success: nodeResult.success && nodeResult.errorCount === 0,
			totalFiles: files.length,
			successCount: nodeResult.successCount,
			errorCount: nodeResult.errorCount,
			duration: nodeResult.duration,
			message: nodeResult.message,
			phasesExecuted: ["nodes"],
			nodeErrors: nodeResult.nodeErrors,
			relationshipErrors: [],
			propertyStats,
			relationshipStats: {
				successCount: 0,
				errorCount: 0,
			},
			nodesCreated: nodeResult.nodesCreated,
			nodesUpdated: nodeResult.nodesUpdated,
			propertiesSet: nodeResult.propertiesSet,
		}
	} catch (error) {
		// Cleanup on error
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Sync failed: ${errorMessage}`)
	}
}

/**
 * Syncs relationships only
 */
export async function syncRelationshipsOnly(context: SyncContext, options?: SyncOptions): Promise<MigrationResult> {
	if (SyncInfrastructure.getCurrentSync()) {
		throw new Error("Sync already in progress")
	}

	const startTime = Date.now()
	SyncInfrastructure.initializeSync()

	let driver: Driver | null = null
	let session: Session | null = null

	try {
		// Scanning progress
		const scanningProgress: SyncProgress = {
			current: 0,
			total: 0,
			status: "scanning",
		}
		context.onProgress(scanningProgress)
		StateService.setMigrationState({ progress: scanningProgress })

		// Find all markdown files
		const files = await SyncInfrastructure.findMarkdownFiles(context.vaultPath)

		if (files.length === 0) {
			SyncInfrastructure.clearSync()
			return {
				success: true,
				totalFiles: 0,
				successCount: 0,
				errorCount: 0,
				duration: Date.now() - startTime,
				message: "No markdown files found",
				phasesExecuted: [],
				nodeErrors: [],
				relationshipErrors: [],
				propertyStats: {},
				relationshipStats: {
					successCount: 0,
					errorCount: 0,
				},
			}
		}

		// Connect to Neo4j
		const connection = await SyncInfrastructure.connect(context.uri, context.credentials, context.onProgress)
		driver = connection.driver
		session = connection.session

		// Initialize property stats for enabled properties (filtered if relationshipPropertyFilter provided)
		const propertyStats: Record<string, RelationshipPropertyCounts> = {}
		let enabledMappings = ConfigurationService.getEnabledRelationshipMappings(context.settings)
		if (options?.relationshipPropertyFilter && options.relationshipPropertyFilter.length > 0) {
			enabledMappings = enabledMappings.filter(mapping =>
				options.relationshipPropertyFilter!.includes(mapping.propertyName)
			)
		}
		for (const mapping of enabledMappings) {
			propertyStats[mapping.propertyName] = {
				successCount: 0,
				errorCount: 0,
				fileErrors: [],
			}
		}

		// Set initial status
		context.onProgress({
			current: 0,
			total: files.length,
			status: "creating_relationships",
		})
		StateService.setMigrationState({
			progress: {
				current: 0,
				total: files.length,
				status: "creating_relationships",
			},
		})

		// Sync relationships
		const relResult = await syncRelationships(
			session,
			context.vaultPath,
			files,
			context.app,
			context.settings,
			context.onProgress,
			propertyStats,
			options?.relationshipPropertyFilter
		)

		// Cleanup
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		return {
			success: relResult.errorCount === 0,
			totalFiles: files.length,
			successCount: 0, // No nodes created
			errorCount: relResult.errorCount,
			duration: Date.now() - startTime,
			message: "Relationship sync completed",
			phasesExecuted: ["relationships"],
			nodeErrors: [],
			relationshipErrors: relResult.errors,
			propertyStats: relResult.propertyStats,
			relationshipStats: {
				successCount: relResult.successCount,
				errorCount: relResult.errorCount,
			},
			relationshipsCreated: relResult.relationshipsCreated,
			relationshipsUpdated: relResult.relationshipsUpdated,
			targetNodesCreated: relResult.targetNodesCreated,
		}
	} catch (error) {
		// Cleanup on error
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Sync failed: ${errorMessage}`)
	}
}

/**
 * Syncs both nodes and relationships (full sync)
 */
export async function syncAll(context: SyncContext, options?: SyncOptions): Promise<MigrationResult> {
	if (SyncInfrastructure.getCurrentSync()) {
		throw new Error("Sync already in progress")
	}

	const startTime = Date.now()
	SyncInfrastructure.initializeSync()

	let driver: Driver | null = null
	let session: Session | null = null

	try {
		// Scanning progress
		const scanningProgress: SyncProgress = {
			current: 0,
			total: 0,
			status: "scanning",
		}
		context.onProgress(scanningProgress)
		StateService.setMigrationState({ progress: scanningProgress })

		// Find all markdown files
		const files = await SyncInfrastructure.findMarkdownFiles(context.vaultPath)

		if (files.length === 0) {
			SyncInfrastructure.clearSync()
			return {
				success: true,
				totalFiles: 0,
				successCount: 0,
				errorCount: 0,
				duration: Date.now() - startTime,
				message: "No markdown files found",
				phasesExecuted: [],
				nodeErrors: [],
				relationshipErrors: [],
				propertyStats: {},
				relationshipStats: {
					successCount: 0,
					errorCount: 0,
				},
			}
		}

		// Connect to Neo4j
		const connection = await SyncInfrastructure.connect(context.uri, context.credentials, context.onProgress)
		driver = connection.driver
		session = connection.session

		// Initialize property stats for enabled properties (filtered if relationshipPropertyFilter provided)
		const propertyStats: Record<string, RelationshipPropertyCounts> = {}
		let enabledMappings = ConfigurationService.getEnabledRelationshipMappings(context.settings)
		if (options?.relationshipPropertyFilter && options.relationshipPropertyFilter.length > 0) {
			enabledMappings = enabledMappings.filter(mapping =>
				options.relationshipPropertyFilter!.includes(mapping.propertyName)
			)
		}
		for (const mapping of enabledMappings) {
			propertyStats[mapping.propertyName] = {
				successCount: 0,
				errorCount: 0,
				fileErrors: [],
			}
		}

		// Phase 1: Sync node properties
		const nodeResult = await syncNodeProperties(
			session,
			context.vaultPath,
			files,
			context.onProgress,
			context.app,
			context.settings,
			options?.nodePropertyFilter
		)

		// Phase 2: Sync relationships (if not cancelled)
		let relationshipStats = { successCount: 0, errorCount: 0 }
		const relationshipErrors: import("../../types").RelationshipCreationError[] = []
		let relResult: import("./types").RelationshipSyncResult | null = null

		if (!SyncInfrastructure.isCancelled()) {
			relResult = await syncRelationships(
				session,
				context.vaultPath,
				files,
				context.app,
				context.settings,
				context.onProgress,
				propertyStats,
				options?.relationshipPropertyFilter
			)
			relationshipStats = {
				successCount: relResult.successCount,
				errorCount: relResult.errorCount,
			}
			relationshipErrors.push(...relResult.errors)
		}

		// Phase 3: Sync labels (if not cancelled)
		let labelStats = { labelsApplied: 0, errorCount: 0 }
		const labelErrors: import("../../types").LabelApplicationError[] = []
		let labelResult: import("./operations/labelSync").LabelSyncResult | null = null

		if (!SyncInfrastructure.isCancelled()) {
			labelResult = await syncLabelsWithSession(
				session,
				context.vaultPath,
				files,
				context.app,
				context.settings,
				options?.labelFilter,
				context.onProgress
			)
			labelStats = {
				labelsApplied: labelResult.labelsApplied,
				errorCount: labelResult.errorCount,
			}
			labelErrors.push(...labelResult.errors)
		}

		// Cleanup
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		const totalErrorCount = nodeResult.errorCount + relationshipStats.errorCount + labelStats.errorCount

		return {
			success: nodeResult.success && totalErrorCount === 0,
			totalFiles: files.length,
			successCount: nodeResult.successCount,
			errorCount: totalErrorCount,
			duration: nodeResult.duration,
			message: nodeResult.message,
			phasesExecuted: ["nodes", "relationships", "labels"],
			nodeErrors: nodeResult.nodeErrors,
			relationshipErrors,
			propertyStats,
			relationshipStats,
			labelStats,
			labelErrors,
			nodesCreated: nodeResult.nodesCreated,
			nodesUpdated: nodeResult.nodesUpdated,
			propertiesSet: nodeResult.propertiesSet,
			relationshipsCreated: relResult?.relationshipsCreated,
			relationshipsUpdated: relResult?.relationshipsUpdated,
			targetNodesCreated: relResult?.targetNodesCreated,
		}
	} catch (error) {
		// Cleanup on error
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		SyncInfrastructure.clearSync()

		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Sync failed: ${errorMessage}`)
	}
}

/**
 * Cancels the current sync
 */
export function cancelSync(): void {
	SyncInfrastructure.cancel()
}

/**
 * Pauses the current sync
 */
export function pauseSync(): void {
	SyncInfrastructure.pause()
}

/**
 * Resumes a paused sync
 */
export function resumeSync(): void {
	SyncInfrastructure.resume()
}

/**
 * Checks if a sync is currently running
 */
export function isSyncRunning(): boolean {
	const state = StateService.getMigrationStatus()
	return state.running && !state.cancelled
}

/**
 * Checks if the current sync is paused
 */
export function isSyncPaused(): boolean {
	return SyncInfrastructure.isPaused()
}

