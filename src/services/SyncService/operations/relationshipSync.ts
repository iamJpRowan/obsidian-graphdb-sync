import { Session } from "neo4j-driver"
import type { App } from "obsidian"
import type { PluginSettings, RelationshipMappingConfig, RelationshipCreationError, RelationshipPropertyCounts } from "../../../types"
import { ConfigurationService } from "../../ConfigurationService"
import { extractFrontMatter, getFileFromPath } from "../../../utils/frontMatterExtractor"
import { extractWikilinkTargets } from "../../../utils/wikilinkExtractor"
import { categorizeError } from "../../../utils/errorCategorizer"
import { SyncInfrastructure } from "../infrastructure"
import { normalizePath, getFileName, calculateBatchSize, extractCounterValue } from "../utils"
import type { SyncProgress, RelationshipSyncResult } from "../types"
import { StateService } from "../../StateService"

/**
 * Interface for pre-processed relationship data
 */
interface ProcessedRelationship {
	file: string
	property: string
	target: string
	relationshipType: string
	direction: "outgoing" | "incoming"
	error?: RelationshipCreationError
}

/**
 * Syncs relationships for all files
 */
export async function syncRelationships(
	session: Session,
	vaultPath: string,
	files: string[],
	app: App,
	settings: PluginSettings,
	onProgress: (progress: SyncProgress) => void,
	propertyStats: Record<string, RelationshipPropertyCounts>,
	relationshipPropertyFilter?: string[]
): Promise<RelationshipSyncResult> {
	let successCount = 0
	let errorCount = 0
	const errors: RelationshipCreationError[] = []
	
	// Aggregate Neo4j statistics
	let totalRelationshipsCreated = 0
	let totalRelationshipsUpdated = 0
	let totalTargetNodesCreated = 0

	// Get all enabled relationship mappings, filtered if property filter provided
	let enabledMappings = ConfigurationService.getEnabledRelationshipMappings(settings)
	if (relationshipPropertyFilter && relationshipPropertyFilter.length > 0) {
		enabledMappings = enabledMappings.filter(mapping =>
			relationshipPropertyFilter.includes(mapping.propertyName)
		)
	}
	const relationshipMappings = enabledMappings.map((mapping) => ({
		propertyName: mapping.propertyName,
		config: {
			relationshipType: mapping.relationshipType,
			direction: mapping.direction,
		} as RelationshipMappingConfig,
	}))

	if (relationshipMappings.length === 0) {
		// No relationship mappings configured
		return { 
			successCount: 0, 
			errorCount: 0, 
			errors: [], 
			propertyStats,
			relationshipsCreated: 0,
			relationshipsUpdated: 0,
			targetNodesCreated: 0,
		}
	}
	
	// Calculate batch size (for file processing)
	const batchSize = calculateBatchSize(files.length, relationshipMappings.length, settings)

	// Pre-process files: extract front matter and build relationship data
	const processedRelationships: ProcessedRelationship[] = []
	for (const filePath of files) {
		const relativePath = normalizePath(filePath, vaultPath)
		
		// Get file from Obsidian
		const file = getFileFromPath(app, relativePath)
		if (!file) {
			continue
		}

		// Extract front matter
		const frontMatter = extractFrontMatter(app, file)
		if (!frontMatter) {
			continue
		}

		// Process each relationship mapping
		for (const { propertyName, config } of relationshipMappings) {
			const propertyValue = frontMatter[propertyName]
			if (!propertyValue) {
				continue
			}

			// Validate relationship type
			if (!config.relationshipType || config.relationshipType.trim().length === 0) {
				// Validation error - empty relationship type
				const validationError: RelationshipCreationError = {
					file: relativePath,
					property: propertyName,
					target: "",
					error: "Relationship type is empty",
					errorType: "VALIDATION",
				}
				errorCount++
				errors.push(validationError)
				
				// Update property stats
				if (propertyStats[propertyName]) {
					propertyStats[propertyName].errorCount++
					propertyStats[propertyName].fileErrors.push(validationError)
				}
				continue
			}

			// Extract wikilink targets
			const targets = extractWikilinkTargets(propertyValue, app)

			// Create relationship entries for each target
			for (const targetPath of targets) {
				processedRelationships.push({
					file: relativePath,
					property: propertyName,
					target: targetPath,
					relationshipType: config.relationshipType,
					direction: config.direction,
				})
			}
		}
	}

	// Use a transaction for batch operations
	const tx = session.beginTransaction()
	SyncInfrastructure.setTransaction(tx)

	try {
		// Process relationships in batches
		for (let batchStart = 0; batchStart < processedRelationships.length; batchStart += batchSize) {
			// Wait if paused
			await SyncInfrastructure.waitIfPaused()

			// Check for cancellation
			if (SyncInfrastructure.isCancelled()) {
				await tx.rollback()
				SyncInfrastructure.clearTransaction()
				return { 
					successCount, 
					errorCount, 
					errors, 
					propertyStats,
					relationshipsCreated: totalRelationshipsCreated,
					relationshipsUpdated: totalRelationshipsUpdated,
					targetNodesCreated: totalTargetNodesCreated,
				}
			}

			const batch = processedRelationships.slice(batchStart, batchStart + batchSize)
			const validBatch = batch.filter(r => !r.error)

			if (validBatch.length === 0) {
				errorCount += batch.length
				continue
			}

			// Step 1: Collect unique target paths and batch create target nodes
			const uniqueTargets = new Map<string, string>() // path -> name
			for (const rel of validBatch) {
				if (!uniqueTargets.has(rel.target)) {
					uniqueTargets.set(rel.target, getFileName(rel.target))
				}
			}

			if (uniqueTargets.size > 0) {
				try {
					const targetBatchData = Array.from(uniqueTargets.entries()).map(([path, name]) => ({
						targetPath: path,
						targetName: name,
					}))

					const targetResult = await tx.run(
						`
						UNWIND $batch AS item
						MERGE (target:Note {path: item.targetPath})
						ON CREATE SET target.name = item.targetName
						`,
						{ batch: targetBatchData }
					)

					const targetSummary = targetResult.summary
					const targetCounters = targetSummary.counters as unknown as {
						nodesCreated?: unknown
					}
					const batchTargetNodesCreated = extractCounterValue(targetCounters.nodesCreated)
					totalTargetNodesCreated += batchTargetNodesCreated
				} catch (targetError) {
					// Target node creation failure - mark all relationships using these targets as errors
					const errorMessage = targetError instanceof Error ? targetError.message : String(targetError)
					const errorType = categorizeError(targetError)
					
					for (const rel of validBatch) {
						if (uniqueTargets.has(rel.target)) {
							const targetErrorObj: RelationshipCreationError = {
								file: rel.file,
								property: rel.property,
								target: rel.target,
								error: `Target node creation failed: ${errorMessage}`,
								errorType: errorType === "UNKNOWN" ? "TARGET_NODE_FAILURE" : errorType,
							}
							errorCount++
							errors.push(targetErrorObj)
							
							if (propertyStats[rel.property]) {
								propertyStats[rel.property].errorCount++
								propertyStats[rel.property].fileErrors.push(targetErrorObj)
							}
						}
					}
					continue // Skip relationship creation for this batch
				}
			}

			// Step 2: Batch check source nodes exist
			const uniqueSources = new Set<string>()
			for (const rel of validBatch) {
				uniqueSources.add(rel.file)
			}

			let validSourceNodes: Set<string>
			if (uniqueSources.size > 0) {
				try {
					const sourceBatchData = Array.from(uniqueSources)
					const sourceCheckResult = await tx.run(
						`
						UNWIND $batch AS sourcePath
						MATCH (source:Note {path: sourcePath})
						RETURN sourcePath
						`,
						{ batch: sourceBatchData }
					)

					validSourceNodes = new Set(
						sourceCheckResult.records.map(record => record.get("sourcePath") as string)
					)
				} catch (sourceError) {
					// Source check failure - mark all relationships as errors
					const errorMessage = sourceError instanceof Error ? sourceError.message : String(sourceError)
					const errorType = categorizeError(sourceError)
					
					for (const rel of validBatch) {
						const sourceErrorObj: RelationshipCreationError = {
							file: rel.file,
							property: rel.property,
							target: rel.target,
							error: `Source node check failed: ${errorMessage}`,
							errorType,
						}
						errorCount++
						errors.push(sourceErrorObj)
						
						if (propertyStats[rel.property]) {
							propertyStats[rel.property].errorCount++
							propertyStats[rel.property].fileErrors.push(sourceErrorObj)
						}
					}
					continue // Skip relationship creation for this batch
				}
			} else {
				validSourceNodes = new Set()
			}

			// Filter out relationships where source node doesn't exist
			const relationshipsWithValidSources = validBatch.filter(rel => validSourceNodes.has(rel.file))
			
			// Mark missing source nodes as errors
			for (const rel of validBatch) {
				if (!validSourceNodes.has(rel.file)) {
					const sourceMissingError: RelationshipCreationError = {
						file: rel.file,
						property: rel.property,
						target: rel.target,
						error: "Source node does not exist",
						errorType: "SOURCE_NODE_MISSING",
					}
					errorCount++
					errors.push(sourceMissingError)
					
					if (propertyStats[rel.property]) {
						propertyStats[rel.property].errorCount++
						propertyStats[rel.property].fileErrors.push(sourceMissingError)
					}
				}
			}

			// Step 3: Group relationships by (relationshipType, direction) and batch create
			// Note: Relationship types cannot be parameterized in Cypher, so we must group by type
			const relationshipsByType = new Map<string, ProcessedRelationship[]>()
			for (const rel of relationshipsWithValidSources) {
				const key = `${rel.relationshipType}:${rel.direction}`
				if (!relationshipsByType.has(key)) {
					relationshipsByType.set(key, [])
				}
				relationshipsByType.get(key)!.push(rel)
			}

			// Process each relationship type group
			for (const [key, rels] of relationshipsByType.entries()) {
				if (rels.length === 0) continue

				const [relationshipType, direction] = key.split(":")
				const isOutgoing = direction === "outgoing"

				try {
					const relationshipBatchData = rels.map(rel => ({
						sourcePath: rel.file,
						targetPath: rel.target,
					}))

					// Create relationships based on direction
					// Note: Relationship type is validated to be UPPER_SNAKE_CASE (safe for interpolation)
					const relResult = await tx.run(
						isOutgoing
							? `
								UNWIND $batch AS item
								MATCH (source:Note {path: item.sourcePath})
								MATCH (target:Note {path: item.targetPath})
								MERGE (source)-[r:${relationshipType}]->(target)
								`
							: `
								UNWIND $batch AS item
								MATCH (source:Note {path: item.sourcePath})
								MATCH (target:Note {path: item.targetPath})
								MERGE (target)-[r:${relationshipType}]->(source)
								`,
						{ batch: relationshipBatchData }
					)

					// Capture relationship creation statistics
					const relSummary = relResult.summary
					const relCounters = relSummary.counters as unknown as {
						relationshipsCreated?: unknown
					}
					const batchRelsCreated = extractCounterValue(relCounters.relationshipsCreated)
					totalRelationshipsCreated += batchRelsCreated
					
					// Calculate relationships updated: total in batch minus created
					const batchRelsUpdated = rels.length - batchRelsCreated
					totalRelationshipsUpdated += batchRelsUpdated
					successCount += rels.length

					// Update property stats for success
					for (const rel of rels) {
						if (propertyStats[rel.property]) {
							propertyStats[rel.property].successCount++
						}
					}
				} catch (relError) {
					// Relationship creation failure - mark all relationships in batch as errors
					const errorMessage = relError instanceof Error ? relError.message : String(relError)
					const errorType = categorizeError(relError)
					
					for (const rel of rels) {
						const relationshipError: RelationshipCreationError = {
							file: rel.file,
							property: rel.property,
							target: rel.target,
							error: errorMessage,
							errorType,
						}
						errorCount++
						errors.push(relationshipError)
						
						if (propertyStats[rel.property]) {
							propertyStats[rel.property].errorCount++
							propertyStats[rel.property].fileErrors.push(relationshipError)
						}
					}
				}
			}

			// Update progress
			const progress: SyncProgress = {
				current: Math.min(batchStart + batch.length, processedRelationships.length),
				total: processedRelationships.length,
				status: "creating_relationships",
				currentFile: batch[batch.length - 1]?.file,
			}
			onProgress(progress)
			StateService.setMigrationState({ progress })
		}

		await tx.commit()
		SyncInfrastructure.clearTransaction()

		return { 
			successCount, 
			errorCount, 
			errors, 
			propertyStats,
			relationshipsCreated: totalRelationshipsCreated,
			relationshipsUpdated: totalRelationshipsUpdated,
			targetNodesCreated: totalTargetNodesCreated,
		}
	} catch (error) {
		await tx.rollback()
		SyncInfrastructure.clearTransaction()
		throw error
	}
}

