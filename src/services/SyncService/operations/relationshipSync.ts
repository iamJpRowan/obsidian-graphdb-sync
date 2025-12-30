import { Session } from "neo4j-driver"
import type { App } from "obsidian"
import type { PluginSettings, RelationshipMappingConfig, RelationshipCreationError, PropertyErrorStats } from "../../../types"
import { ConfigurationService } from "../../ConfigurationService"
import { extractFrontMatter, getFileFromPath } from "../../../utils/frontMatterExtractor"
import { extractWikilinkTargets } from "../../../utils/wikilinkExtractor"
import { categorizeError } from "../../../utils/errorCategorizer"
import { SyncInfrastructure } from "../infrastructure"
import { normalizePath, getFileName } from "../utils"
import type { SyncProgress, RelationshipSyncResult } from "../types"
import { StateService } from "../../StateService"

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
	propertyStats: Record<string, PropertyErrorStats>,
	relationshipPropertyFilter?: string[]
): Promise<RelationshipSyncResult> {
	let successCount = 0
	let errorCount = 0
	const errors: RelationshipCreationError[] = []

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
		return { successCount: 0, errorCount: 0, errors: [], propertyStats }
	}

	// Use a transaction for batch operations
	const tx = session.beginTransaction()
	SyncInfrastructure.setTransaction(tx)

	try {
		for (let i = 0; i < files.length; i++) {
			// Wait if paused
			await SyncInfrastructure.waitIfPaused()

			// Check for cancellation
			if (SyncInfrastructure.isCancelled()) {
				await tx.rollback()
				SyncInfrastructure.clearTransaction()
				return { successCount, errorCount, errors, propertyStats }
			}

			const filePath = files[i]
			const relativePath = normalizePath(filePath, vaultPath)

			// Get file from Obsidian
			const file = getFileFromPath(app, relativePath)
			if (!file) {
				// Skip files that don't exist in Obsidian (shouldn't happen, but handle gracefully)
				continue
			}

			// Extract front matter
			const frontMatter = extractFrontMatter(app, file)
			if (!frontMatter) {
				// No front matter, skip
				continue
			}

			// Process each relationship mapping
			for (const { propertyName, config } of relationshipMappings) {
				const propertyValue = frontMatter[propertyName]
				if (!propertyValue) {
					// Property doesn't exist in this file's front matter
					continue
				}

				// Extract wikilink targets
				const targets = extractWikilinkTargets(propertyValue, app)

				// Create relationships for each target
				for (const targetPath of targets) {
					try {
						// Validate relationship type before use (safety check)
						// Note: Relationship types cannot be parameterized in Neo4j Cypher,
						// but we validate them to only contain safe characters (A-Z, 0-9, _)
						if (!config.relationshipType || config.relationshipType.trim().length === 0) {
							// Validation error - empty relationship type
							const validationError: RelationshipCreationError = {
								file: relativePath,
								property: propertyName,
								target: targetPath,
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

						// Ensure target node exists (create placeholder if needed)
						try {
							await tx.run(
								`
								MERGE (target:Note {path: $targetPath})
								ON CREATE SET target.name = $targetName
								`,
								{
									targetPath,
									targetName: getFileName(targetPath),
								}
							)
						} catch (targetError) {
							// Target node creation failure
							const errorMessage =
								targetError instanceof Error ? targetError.message : String(targetError)
							const errorType = categorizeError(targetError)
							const targetErrorObj: RelationshipCreationError = {
								file: relativePath,
								property: propertyName,
								target: targetPath,
								error: `Target node creation failed: ${errorMessage}`,
								errorType: errorType === "UNKNOWN" ? "TARGET_NODE_FAILURE" : errorType,
							}
							errorCount++
							errors.push(targetErrorObj)
							
							// Update property stats
							if (propertyStats[propertyName]) {
								propertyStats[propertyName].errorCount++
								propertyStats[propertyName].fileErrors.push(targetErrorObj)
							}
							continue
						}

						// Check if source node exists before creating relationship
						const sourceCheck = await tx.run(
							`
							MATCH (source:Note {path: $sourcePath})
							RETURN source
							`,
							{ sourcePath: relativePath }
						)

						if (sourceCheck.records.length === 0) {
							// Source node doesn't exist
							const sourceMissingError: RelationshipCreationError = {
								file: relativePath,
								property: propertyName,
								target: targetPath,
								error: "Source node does not exist",
								errorType: "SOURCE_NODE_MISSING",
							}
							errorCount++
							errors.push(sourceMissingError)
							
							// Update property stats
							if (propertyStats[propertyName]) {
								propertyStats[propertyName].errorCount++
								propertyStats[propertyName].fileErrors.push(sourceMissingError)
							}
							continue
						}

						// Create relationship based on direction
						// Note: Relationship type is validated to be UPPER_SNAKE_CASE (safe for interpolation)
						if (config.direction === "outgoing") {
							// (source file)-[RELATIONSHIP_TYPE]->(target file)
							await tx.run(
								`
								MATCH (source:Note {path: $sourcePath})
								MATCH (target:Note {path: $targetPath})
								MERGE (source)-[r:${config.relationshipType}]->(target)
								`,
								{
									sourcePath: relativePath,
									targetPath,
								}
							)
						} else {
							// (target file)-[RELATIONSHIP_TYPE]->(source file)
							await tx.run(
								`
								MATCH (source:Note {path: $sourcePath})
								MATCH (target:Note {path: $targetPath})
								MERGE (target)-[r:${config.relationshipType}]->(source)
								`,
								{
									sourcePath: relativePath,
									targetPath,
								}
							)
						}

						successCount++
						
						// Update property stats for success
						if (propertyStats[propertyName]) {
							propertyStats[propertyName].successCount++
						}
					} catch (error) {
						errorCount++
						const errorMessage =
							error instanceof Error ? error.message : String(error)
						const errorType = categorizeError(error)
						const relationshipError: RelationshipCreationError = {
							file: relativePath,
							property: propertyName,
							target: targetPath,
							error: errorMessage,
							errorType,
						}
						errors.push(relationshipError)
						
						// Update property stats
						if (propertyStats[propertyName]) {
							propertyStats[propertyName].errorCount++
							propertyStats[propertyName].fileErrors.push(relationshipError)
						}
					}
				}
			}

			// Update progress
			const progress: SyncProgress = {
				current: i + 1,
				total: files.length,
				status: "creating_relationships",
				currentFile: relativePath,
			}
			onProgress(progress)
			StateService.setMigrationState({ progress })
		}

		await tx.commit()
		SyncInfrastructure.clearTransaction()

		return { successCount, errorCount, errors, propertyStats }
	} catch (error) {
		await tx.rollback()
		SyncInfrastructure.clearTransaction()
		throw error
	}
}

