import { Session } from "neo4j-driver"
import type { App } from "obsidian"
import type { PluginSettings, NodeCreationError } from "../../../types"
import { ConfigurationService } from "../../ConfigurationService"
import { extractFrontMatter, getFileFromPath } from "../../../utils/frontMatterExtractor"
import { categorizeError } from "../../../utils/errorCategorizer"
import { SyncInfrastructure } from "../infrastructure"
import { normalizePath, getFileName, convertValueToNeo4jType } from "../utils"
import type { SyncProgress, NodeSyncResult } from "../types"
import { StateService } from "../../StateService"

/**
 * Syncs node properties for all files
 */
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

	// Use a transaction for batch operations
	const tx = session.beginTransaction()
	SyncInfrastructure.setTransaction(tx)

	try {
		for (let i = 0; i < files.length; i++) {
			// Wait if paused
			await SyncInfrastructure.waitIfPaused()

			// Check for cancellation (after pause check)
			if (SyncInfrastructure.isCancelled()) {
				await tx.rollback()
				SyncInfrastructure.clearTransaction()
				StateService.setMigrationState({
					running: false,
					paused: false,
					cancelled: true,
					progress: null,
				})
				return {
					success: false,
					successCount,
					errorCount,
					nodeErrors,
					duration: Date.now() - startTime,
					message: "Sync cancelled",
				}
			}

			const filePath = files[i]

			try {
				// Get relative path from vault root
				const relativePath = normalizePath(filePath, vaultPath)
				const fileName = getFileName(filePath)

				// Get file from Obsidian to extract front matter
				const file = getFileFromPath(app, relativePath)
				const frontMatter = file ? extractFrontMatter(app, file) : null

				// Get enabled node property mappings, filtered if property filter provided
				let enabledNodePropertyMappings = ConfigurationService.getEnabledNodePropertyMappings(settings)
				if (nodePropertyFilter && nodePropertyFilter.length > 0) {
					enabledNodePropertyMappings = enabledNodePropertyMappings.filter(mapping =>
						nodePropertyFilter.includes(mapping.propertyName)
					)
				}

				// Build SET clause for node properties
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
							// Only set property if conversion succeeded (not null)
							if (convertedValue !== null) {
								setProperties[mapping.nodePropertyName] = convertedValue
							}
						}
					}
				}

				// Build dynamic SET clause
				const setClauses: string[] = []
				const params: Record<string, unknown> = { path: relativePath }
				
				for (const [key, value] of Object.entries(setProperties)) {
					const paramName = `prop_${key.replace(/[^a-zA-Z0-9]/g, "_")}`
					// Escape property name if it contains special characters
					const escapedKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `\`${key.replace(/`/g, "``")}\``
					setClauses.push(`n.${escapedKey} = $${paramName}`)
					params[paramName] = value
				}

				// MERGE node to prevent duplicates and SET all properties
				// Always set at least the name property
				if (setClauses.length === 0) {
					setClauses.push("n.name = $name")
					params.name = fileName
				}

				await tx.run(
					`
					MERGE (n:Note {path: $path})
					SET ${setClauses.join(", ")}
					`,
					params
				)

				successCount++
				const isPropertyUpdate = nodePropertyFilter && nodePropertyFilter.length > 0
				const status: SyncProgress["status"] = isPropertyUpdate ? "updating_properties" : "creating_nodes"
				const progress: SyncProgress = {
					current: i + 1,
					total: files.length,
					status,
					currentFile: relativePath,
				}
				onProgress(progress)
				StateService.setMigrationState({ progress })
			} catch (error) {
				errorCount++
				const errorMessage =
					error instanceof Error ? error.message : String(error)
				// Get relative path for error reporting
				const errorRelativePath = normalizePath(filePath, vaultPath)
				const errorType = categorizeError(error)
				nodeErrors.push({
					file: errorRelativePath,
					error: errorMessage,
					errorType,
				})
				const isPropertyUpdate = nodePropertyFilter && nodePropertyFilter.length > 0
				const status: SyncProgress["status"] = isPropertyUpdate ? "updating_properties" : "creating_nodes"
				const progress: SyncProgress = {
					current: i + 1,
					total: files.length,
					status,
					currentFile: errorRelativePath,
				}
				onProgress(progress)
				StateService.setMigrationState({ progress })
			}
		}

		await tx.commit()
		SyncInfrastructure.clearTransaction()

		return {
			success: true,
			successCount,
			errorCount,
			nodeErrors,
			duration: Date.now() - startTime,
			message: "Sync completed successfully",
		}
	} catch (error) {
		await tx.rollback()
		SyncInfrastructure.clearTransaction()
		throw error
	}
}

