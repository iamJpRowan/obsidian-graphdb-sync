import { Session } from "neo4j-driver"
import type { App } from "obsidian"
import type { PluginSettings, NodeCreationError } from "../../../types"
import { ConfigurationService } from "../../ConfigurationService"
import { extractFrontMatter, getFileFromPath } from "../../../utils/frontMatterExtractor"
import { categorizeError } from "../../../utils/errorCategorizer"
import { SyncInfrastructure } from "../infrastructure"
import { normalizePath, getFileName, convertValueToNeo4jType, calculateBatchSize, extractCounterValue } from "../utils"
import type { SyncProgress, NodeSyncResult } from "../types"
import { StateService } from "../../StateService"

/**
 * Syncs node properties for all files
 */
/**
 * Interface for pre-processed file data
 */
interface ProcessedFileData {
	path: string
	name: string
	properties: Record<string, unknown>
	error?: NodeCreationError
}

export async function syncNodeProperties(
	session: Session,
	vaultPath: string,
	files: string[],
	onProgress: (progress: SyncProgress) => void,
	app: App,
	settings: PluginSettings,
	nodePropertyFilter?: string[]
): Promise<NodeSyncResult> {
	const startTime = Date.now()
	let successCount = 0
	let errorCount = 0
	const nodeErrors: NodeCreationError[] = []

	// Get enabled node property mappings, filtered if property filter provided
	let enabledNodePropertyMappings = ConfigurationService.getEnabledNodePropertyMappings(settings)
	if (nodePropertyFilter && nodePropertyFilter.length > 0) {
		enabledNodePropertyMappings = enabledNodePropertyMappings.filter(mapping =>
			nodePropertyFilter.includes(mapping.propertyName)
		)
	}

	// Pre-process files: extract front matter and build property data
	const processedFiles: ProcessedFileData[] = []
	for (const filePath of files) {
		try {
			const relativePath = normalizePath(filePath, vaultPath)
			const fileName = getFileName(filePath)
			const file = getFileFromPath(app, relativePath)
			const frontMatter = file ? extractFrontMatter(app, file) : null

			const setProperties: Record<string, unknown> = {
				name: fileName,
			}

			// Process each enabled node property mapping
			if (frontMatter && enabledNodePropertyMappings.length > 0) {
				for (const mapping of enabledNodePropertyMappings) {
					const propertyValue = frontMatter[mapping.propertyName]
					if (propertyValue !== undefined && propertyValue !== null) {
						const convertedValue = convertValueToNeo4jType(
							propertyValue,
							mapping.nodePropertyType
						)
						if (convertedValue !== null) {
							setProperties[mapping.nodePropertyName] = convertedValue
						}
					}
				}
			}

			processedFiles.push({
				path: relativePath,
				name: fileName,
				properties: setProperties,
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			const errorRelativePath = normalizePath(filePath, vaultPath)
			const errorType = categorizeError(error)
			const nodeError: NodeCreationError = {
				file: errorRelativePath,
				error: errorMessage,
				errorType,
			}
			nodeErrors.push(nodeError)
			processedFiles.push({
				path: errorRelativePath,
				name: getFileName(filePath),
				properties: {},
				error: nodeError,
			})
		}
	}

	// Calculate batch size
	const batchSize = calculateBatchSize(files.length, enabledNodePropertyMappings.length, settings)

	// Use a transaction for batch operations
	const tx = session.beginTransaction()
	SyncInfrastructure.setTransaction(tx)

	// Aggregate Neo4j statistics
	let totalNodesCreated = 0
	let totalNodesUpdated = 0
	let totalPropertiesSet = 0

	try {
		// Process files in batches
		for (let batchStart = 0; batchStart < processedFiles.length; batchStart += batchSize) {
			// Wait if paused
			await SyncInfrastructure.waitIfPaused()

			// Check for cancellation
			if (SyncInfrastructure.isCancelled()) {
				await tx.rollback()
				SyncInfrastructure.clearTransaction()
				StateService.setMigrationState({
					running: false,
					paused: false,
					cancelled: true,
					progress: null,
				})
				// Calculate nodes updated: total files processed successfully minus nodes created
				totalNodesUpdated = successCount - totalNodesCreated
				return {
					success: false,
					successCount,
					errorCount,
					nodeErrors,
					duration: Date.now() - startTime,
					message: "Sync cancelled",
					nodesCreated: totalNodesCreated,
					nodesUpdated: totalNodesUpdated,
					propertiesSet: totalPropertiesSet,
				}
			}

			const batch = processedFiles.slice(batchStart, batchStart + batchSize)
			const validBatch = batch.filter(f => !f.error)

			// Skip batches with only errors
			if (validBatch.length === 0) {
				errorCount += batch.length
				continue
			}

			// Build batch data for UNWIND query
			// Use map structure for properties to allow dynamic property setting
			const batchData = validBatch.map(file => {
				// Build properties map (exclude path and name, they're separate)
				const propertiesMap: Record<string, unknown> = {}
				for (const [key, value] of Object.entries(file.properties)) {
					if (key !== "path" && key !== "name" && value !== null && value !== undefined) {
						propertiesMap[key] = value
					}
				}
				
				return {
					path: file.path,
					name: file.name,
					properties: propertiesMap,
				}
			})

			try {
				// Execute UNWIND batch query using map merge for properties
				// SET n += item.properties merges the properties map into the node
				const result = await tx.run(
					`
					UNWIND $batch AS item
					MERGE (n:Note {path: item.path})
					SET n.name = item.name
					SET n += item.properties
					`,
					{ batch: batchData }
				)

				// Capture Neo4j statistics from batch query
				const summary = result.summary
				const counters = summary.counters as unknown as {
					nodesCreated?: unknown
					propertiesSet?: unknown
				}
				const batchNodesCreated = extractCounterValue(counters.nodesCreated)
				const batchPropertiesSet = extractCounterValue(counters.propertiesSet)
				
				totalNodesCreated += batchNodesCreated
				totalPropertiesSet += batchPropertiesSet
				successCount += validBatch.length
			} catch (error) {
				// Batch failed - mark all files in batch as errors
				const errorMessage = error instanceof Error ? error.message : String(error)
				const errorType = categorizeError(error)
				validBatch.forEach(file => {
					errorCount++
					const nodeError: NodeCreationError = {
						file: file.path,
						error: errorMessage,
						errorType,
					}
					nodeErrors.push(nodeError)
				})
			}

			// Count errors from pre-processing
			const batchErrors = batch.filter(f => f.error)
			errorCount += batchErrors.length

			// Update progress
			const isPropertyUpdate = nodePropertyFilter && nodePropertyFilter.length > 0
			const status: SyncProgress["status"] = isPropertyUpdate ? "updating_properties" : "creating_nodes"
			const progress: SyncProgress = {
				current: Math.min(batchStart + batchSize, files.length),
				total: files.length,
				status,
				currentFile: batch[batch.length - 1]?.path,
			}
			onProgress(progress)
			StateService.setMigrationState({ progress })
		}

		await tx.commit()
		SyncInfrastructure.clearTransaction()

		// Calculate nodes updated: total files processed successfully minus nodes created
		totalNodesUpdated = successCount - totalNodesCreated

		return {
			success: true,
			successCount,
			errorCount,
			nodeErrors,
			duration: Date.now() - startTime,
			message: "Sync completed successfully",
			nodesCreated: totalNodesCreated,
			nodesUpdated: totalNodesUpdated,
			propertiesSet: totalPropertiesSet,
		}
	} catch (error) {
		await tx.rollback()
		SyncInfrastructure.clearTransaction()
		throw error
	}
}

