import { Session } from "neo4j-driver"
import type { App } from "obsidian"
import type { PluginSettings, LabelApplicationError } from "../../../types"
import { ConfigurationService } from "../../ConfigurationService"
import { getFileFromPath } from "../../../utils/frontMatterExtractor"
import { categorizeError } from "../../../utils/errorCategorizer"
import { SyncInfrastructure } from "../infrastructure"
import { normalizePath, calculateBatchSize } from "../utils"
import type { SyncProgress } from "../types"
import { StateService } from "../../StateService"

/**
 * Result of a label sync operation
 */
export interface LabelSyncResult {
	success: boolean
	labelsApplied: number
	errorCount: number
	errors: LabelApplicationError[]
	duration: number
	message?: string
}

/**
 * Syncs labels for all files based on label rules
 * Standalone function that manages its own connection
 */
export async function syncLabels(
	app: App,
	vaultPath: string,
	uri: string,
	credentials: { username: string; password: string },
	settings: PluginSettings,
	labelFilter?: string[] // Optional: sync only specific labels (by labelName)
): Promise<LabelSyncResult> {
	const startTime = Date.now()

	// Get label rules, filtered if labelFilter provided
	let labelRules = ConfigurationService.getLabelRules(settings)
	if (labelFilter && labelFilter.length > 0) {
		labelRules = labelRules.filter(rule => labelFilter.includes(rule.labelName))
	}

	if (labelRules.length === 0) {
		return {
			success: true,
			labelsApplied: 0,
			errorCount: 0,
			errors: [],
			duration: Date.now() - startTime,
			message: "No label rules to sync",
		}
	}

	// Find all markdown files
	const files = await SyncInfrastructure.findMarkdownFiles(vaultPath)

	if (files.length === 0) {
		return {
			success: true,
			labelsApplied: 0,
			errorCount: 0,
			errors: [],
			duration: Date.now() - startTime,
			message: "No markdown files found",
		}
	}

	// Connect to Neo4j
	const connection = await SyncInfrastructure.connect(uri, credentials, (progress: SyncProgress) => {
		StateService.setMigrationState({ progress })
	})
	const driver = connection.driver
	const session = connection.session

	try {
		const result = await syncLabelsWithSession(
			session,
			vaultPath,
			files,
			app,
			settings,
			labelFilter,
			(progress: SyncProgress) => {
				StateService.setMigrationState({ progress })
			}
		)

		await SyncInfrastructure.cleanupDriverAndSession(driver, session)

		return result
	} catch (error) {
		await SyncInfrastructure.cleanupDriverAndSession(driver, session)
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Label sync failed: ${errorMessage}`)
	}
}

/**
 * Syncs labels using an existing session (for use in full sync)
 */
export async function syncLabelsWithSession(
	session: Session,
	vaultPath: string,
	files: string[],
	app: App,
	settings: PluginSettings,
	labelFilter?: string[],
	onProgress?: (progress: SyncProgress) => void
): Promise<LabelSyncResult> {
	const startTime = Date.now()
	let labelsApplied = 0
	let errorCount = 0
	const errors: LabelApplicationError[] = []

	// Get label rules, filtered if labelFilter provided
	let labelRules = ConfigurationService.getLabelRules(settings)
	if (labelFilter && labelFilter.length > 0) {
		labelRules = labelRules.filter(rule => labelFilter.includes(rule.labelName))
	}

	if (labelRules.length === 0) {
		return {
			success: true,
			labelsApplied: 0,
			errorCount: 0,
			errors: [],
			duration: Date.now() - startTime,
			message: "No label rules to sync",
		}
	}

	try {
		// Process files and determine which labels to apply
		const labelApplications: Array<{ filePath: string; labelName: string }> = []

		// Separate tag-based and path-based rules for efficient processing
		const tagRules = labelRules.filter(rule => rule.type === "tag")
		const pathRules = labelRules.filter(rule => rule.type === "path")

		for (const filePath of files) {
			const relativePath = normalizePath(filePath, vaultPath)
			const file = getFileFromPath(app, relativePath)
			if (!file) {
				continue
			}

			// Get file metadata cache once per file
			const cache = app.metadataCache.getFileCache(file)
			
			// Extract all tags from the file once (frontmatter + inline)
			const fileTags = new Set<string>()
			
			if (cache) {
				// Frontmatter tags - can be string, string[], or array of objects
				const frontmatterTags = cache.frontmatter?.tags || []
				if (Array.isArray(frontmatterTags)) {
					for (const tag of frontmatterTags) {
						// Handle both string tags and tag objects
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const tagStr = typeof tag === "string" ? tag : (tag as any)?.tag || String(tag)
						const normalizedTag = tagStr.startsWith("#") ? tagStr.substring(1) : tagStr
						fileTags.add(normalizedTag)
					}
				} else if (typeof frontmatterTags === "string") {
					const normalizedTag = frontmatterTags.startsWith("#") ? frontmatterTags.substring(1) : frontmatterTags
					fileTags.add(normalizedTag)
				}

				// Inline tags - TAG OBJECTS with .tag property
				if (cache.tags) {
					for (const tagObj of cache.tags) {
						const tagStr = tagObj.tag || ""
						const normalizedTag = tagStr.startsWith("#") ? tagStr.substring(1) : tagStr
						if (normalizedTag) {
							fileTags.add(normalizedTag)
						}
					}
				}
			}

			// Check all tag-based rules against the file's tag set
			for (const rule of tagRules) {
				if (fileTags.has(rule.pattern)) {
					labelApplications.push({
						filePath: relativePath,
						labelName: rule.labelName,
					})
				}
			}

			// Check all path-based rules
			for (const rule of pathRules) {
				let shouldApplyLabel = false

				// Empty pattern means root directory
				if (rule.pattern === "") {
					// Root: file must be in root (no "/" in path except at start)
					const pathParts = relativePath.split("/")
					if (pathParts.length === 2) { // ["", "filename.md"]
						shouldApplyLabel = true
					}
				} else {
					// Directory: file path must start with directory path
					if (relativePath === rule.pattern || relativePath.startsWith(rule.pattern + "/")) {
						shouldApplyLabel = true
					}
				}

				if (shouldApplyLabel) {
					labelApplications.push({
						filePath: relativePath,
						labelName: rule.labelName,
					})
				}
			}
		}

		if (labelApplications.length === 0) {
			return {
				success: true,
				labelsApplied: 0,
				errorCount: 0,
				errors: [],
				duration: Date.now() - startTime,
				message: "No labels to apply",
			}
		}

		// Use a transaction for batch operations
		const tx = session.beginTransaction()
		SyncInfrastructure.setTransaction(tx)

		try {
			// Calculate batch size
			const batchSize = calculateBatchSize(files.length, labelRules.length, settings)

			// Process label applications in batches
			for (let batchStart = 0; batchStart < labelApplications.length; batchStart += batchSize) {
				const batch = labelApplications.slice(batchStart, batchStart + batchSize)

				// Group by label name for efficient querying
				const labelsByFile = new Map<string, string[]>()
				for (const app of batch) {
					if (!labelsByFile.has(app.filePath)) {
						labelsByFile.set(app.filePath, [])
					}
					labelsByFile.get(app.filePath)!.push(app.labelName)
				}

				// Build batch data
				const batchData = Array.from(labelsByFile.entries()).map(([filePath, labels]) => ({
					path: filePath,
					labels: labels,
				}))

				try {
					// Apply labels to each file
					// Neo4j requires labels to be applied individually per file
					for (const item of batchData) {
						try {
							// Apply each label individually (Neo4j doesn't support dynamic label lists)
							for (const labelName of item.labels) {
								// Escape label name if it contains special characters
								const escapedLabel = labelName.replace(/[^a-zA-Z0-9_]/g, "_")
								
								await tx.run(
									`
									MATCH (n {path: $path})
									SET n:\`${escapedLabel}\`
									`,
									{ path: item.path }
								)
								labelsApplied++
							}
						} catch (fileError) {
							// Individual file error - mark all labels for this file as errors
							const errorMessage = fileError instanceof Error ? fileError.message : String(fileError)
							const errorType = categorizeError(fileError)
							item.labels.forEach(labelName => {
								errorCount++
								const labelError: LabelApplicationError = {
									file: item.path,
									label: labelName,
									error: errorMessage,
									errorType,
								}
								errors.push(labelError)
							})
						}
					}
				} catch (error) {
					// Batch failed - mark all files in batch as errors
					const errorMessage = error instanceof Error ? error.message : String(error)
					const errorType = categorizeError(error)
					batch.forEach(app => {
						errorCount++
						const labelError: LabelApplicationError = {
							file: app.filePath,
							label: app.labelName,
							error: errorMessage,
							errorType,
						}
						errors.push(labelError)
					})
				}

				// Update progress
				if (onProgress) {
					const progress: SyncProgress = {
						current: Math.min(batchStart + batchSize, labelApplications.length),
						total: labelApplications.length,
						status: "applying_labels",
						currentFile: batch[batch.length - 1]?.filePath,
					}
					onProgress(progress)
				}
			}

			await tx.commit()
			SyncInfrastructure.clearTransaction()
		} catch (error) {
			await tx.rollback()
			SyncInfrastructure.clearTransaction()
			throw error
		}

		return {
			success: errorCount === 0,
			labelsApplied,
			errorCount,
			errors,
			duration: Date.now() - startTime,
			message: errorCount === 0
				? `Successfully applied ${labelsApplied} label(s)`
				: `Applied ${labelsApplied} label(s) with ${errorCount} error(s)`,
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Label sync failed: ${errorMessage}`)
	}
}
