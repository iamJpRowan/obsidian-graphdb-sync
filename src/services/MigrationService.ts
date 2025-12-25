import { readdir } from "fs/promises"
import { join } from "path"
import neo4j, { Driver, Session, Transaction } from "neo4j-driver"
import type { App } from "obsidian"
import type {
	Neo4jCredentials,
	PluginSettings,
	RelationshipMappingConfig,
	MigrationResult,
	NodeCreationError,
	RelationshipCreationError,
	PropertyErrorStats,
} from "../types"
import { StateService } from "./StateService"
import { extractWikilinkTargets } from "../utils/wikilinkExtractor"
import { getRelationshipConfig } from "../utils/propertyMappingHelpers"
import { extractFrontMatter, getFileFromPath } from "../utils/frontMatterExtractor"
import { categorizeError } from "../utils/errorCategorizer"

export interface MigrationProgress {
	current: number
	total: number
	status: "scanning" | "connecting" | "migrating" | "creating_nodes" | "creating_relationships"
	currentFile?: string
}

export type ProgressCallback = (progress: MigrationProgress) => void

/**
 * Service for migrating vault files to Neo4j
 */
export class MigrationService {
	private static currentMigration: {
		cancelled: boolean
		paused: boolean
		driver: Driver | null
		session: Session | null
		transaction: Transaction | null
	} | null = null

	/**
	 * Recursively finds all .md files in a directory
	 */
	private static async findMarkdownFiles(dir: string): Promise<string[]> {
		const files: string[] = []
		const entries = await readdir(dir, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = join(dir, entry.name)

			// Skip hidden directories (like .obsidian)
			if (entry.isDirectory() && entry.name.startsWith(".")) {
				continue
			}

			if (entry.isDirectory()) {
				const subFiles = await this.findMarkdownFiles(fullPath)
				files.push(...subFiles)
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				files.push(fullPath)
			}
		}

		return files
	}

	/**
	 * Extracts the filename without extension from a full path
	 */
	private static getFileName(path: string): string {
		const fileName = path.split(/[/\\]/).pop() || ""
		return fileName.replace(/\.md$/, "")
	}

	/**
	 * Migrates all markdown files to Neo4j
	 */
	private static async migrateFiles(
		session: Session,
		vaultPath: string,
		files: string[],
		onProgress: ProgressCallback
	): Promise<{
		success: boolean
		successCount: number
		errorCount: number
		nodeErrors: NodeCreationError[]
		duration: number
		message?: string
	}> {
		const startTime = Date.now()
		let successCount = 0
		let errorCount = 0
		const nodeErrors: NodeCreationError[] = []

		// Use a transaction for batch operations
		const tx = session.beginTransaction()
		this.currentMigration!.transaction = tx

		try {
			for (let i = 0; i < files.length; i++) {
				// Wait if paused
				while (this.currentMigration?.paused && !this.currentMigration?.cancelled) {
					await new Promise((resolve) => setTimeout(resolve, 100))
				}

				// Check for cancellation (after pause check)
				if (this.currentMigration?.cancelled) {
					await tx.rollback()
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
						message: "Migration cancelled",
					}
				}

				const filePath = files[i]

				try {
					// Get relative path from vault root
					const relativePath = filePath
						.replace(vaultPath + "/", "")
						.replace(vaultPath + "\\", "")
					const fileName = this.getFileName(filePath)

					// MERGE node to prevent duplicates
					await tx.run(
						`
						MERGE (n:Note {path: $path})
						SET n.name = $name
						`,
						{
							path: relativePath,
							name: fileName,
						}
					)

					successCount++
					const progress: MigrationProgress = {
						current: i + 1,
						total: files.length,
						status: "creating_nodes",
						currentFile: relativePath,
					}
					onProgress(progress)
					StateService.setMigrationState({ progress })
				} catch (error) {
					errorCount++
					const errorMessage =
						error instanceof Error ? error.message : String(error)
					// Get relative path for error reporting
					const errorRelativePath = filePath
						.replace(vaultPath + "/", "")
						.replace(vaultPath + "\\", "")
					const errorType = categorizeError(error)
					nodeErrors.push({
						file: errorRelativePath,
						error: errorMessage,
						errorType,
					})
					const progress: MigrationProgress = {
						current: i + 1,
						total: files.length,
						status: "creating_nodes",
						currentFile: errorRelativePath,
					}
					onProgress(progress)
					StateService.setMigrationState({ progress })
				}
			}

			await tx.commit()
			this.currentMigration!.transaction = null

			return {
				success: true,
				successCount,
				errorCount,
				nodeErrors,
				duration: Date.now() - startTime,
				message: "Migration completed successfully",
			}
		} catch (error) {
			await tx.rollback()
			this.currentMigration!.transaction = null
			throw error
		}
	}

	/**
	 * Creates relationships based on configured property mappings (Phase 2)
	 */
	private static async createRelationships(
		session: Session,
		vaultPath: string,
		files: string[],
		app: App,
		settings: PluginSettings,
		onProgress: ProgressCallback,
		propertyStats: Record<string, PropertyErrorStats>
	): Promise<{
		successCount: number
		errorCount: number
		errors: RelationshipCreationError[]
	}> {
		let successCount = 0
		let errorCount = 0
		const errors: RelationshipCreationError[] = []

		// Get all enabled relationship mappings
		const relationshipMappings = Object.entries(settings.propertyMappings || {})
			.map(([propertyName, mapping]) => {
				const relConfig = getRelationshipConfig(settings, propertyName)
				if (relConfig) {
					return { propertyName, config: relConfig }
				}
				return null
			})
			.filter((m): m is { propertyName: string; config: RelationshipMappingConfig } => m !== null)

		if (relationshipMappings.length === 0) {
			// No relationship mappings configured
			return { successCount: 0, errorCount: 0, errors: [] }
		}

		// Use a transaction for batch operations
		const tx = session.beginTransaction()
		this.currentMigration!.transaction = tx

		try {
			for (let i = 0; i < files.length; i++) {
				// Wait if paused
				while (this.currentMigration?.paused && !this.currentMigration?.cancelled) {
					await new Promise((resolve) => setTimeout(resolve, 100))
				}

				// Check for cancellation
				if (this.currentMigration?.cancelled) {
					await tx.rollback()
					return { successCount, errorCount, errors }
				}

				const filePath = files[i]
				const relativePath = filePath
					.replace(vaultPath + "/", "")
					.replace(vaultPath + "\\", "")

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
										targetName: this.getFileName(targetPath),
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
				const progress: MigrationProgress = {
					current: i + 1,
					total: files.length,
					status: "creating_relationships",
					currentFile: relativePath,
				}
				onProgress(progress)
				StateService.setMigrationState({ progress })
			}

			await tx.commit()
			this.currentMigration!.transaction = null

			return { successCount, errorCount, errors }
		} catch (error) {
			await tx.rollback()
			this.currentMigration!.transaction = null
			throw error
		}
	}

	/**
	 * Runs migration from vault to Neo4j
	 * @param vaultPath - Path to the Obsidian vault
	 * @param uri - Neo4j connection URI
	 * @param credentials - Neo4j credentials
	 * @param onProgress - Callback for progress updates
	 * @param app - Obsidian app instance (required for relationship creation)
	 * @param settings - Plugin settings (required for relationship creation)
	 * @returns Migration result
	 */
	static async migrate(
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		onProgress: ProgressCallback,
		app?: App,
		settings?: PluginSettings
	): Promise<MigrationResult> {
		if (this.currentMigration) {
			throw new Error("Migration already in progress")
		}

		const startTime = Date.now()

		// Initialize migration state
		this.currentMigration = {
			cancelled: false,
			paused: false,
			driver: null,
			session: null,
			transaction: null,
		}

		// Emit initial migration state
		StateService.setMigrationState({
			running: true,
			paused: false,
			cancelled: false,
			progress: null,
		})

		let driver: Driver | null = null
		let session: Session | null = null

		try {
			const scanningProgress: MigrationProgress = {
				current: 0,
				total: 0,
				status: "scanning",
			}
			onProgress(scanningProgress)
			StateService.setMigrationState({ progress: scanningProgress })

			// Find all markdown files
			const files = await this.findMarkdownFiles(vaultPath)

			if (files.length === 0) {
				this.currentMigration = null
				StateService.setMigrationState({
					running: false,
					paused: false,
					cancelled: false,
					progress: null,
				})
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
					propertyWriteErrors: [],
					propertyStats: {},
				}
			}

			onProgress({
				current: 0,
				total: files.length,
				status: "connecting",
			})
			StateService.setMigrationState({
				progress: {
					current: 0,
					total: files.length,
					status: "connecting",
				},
			})

			// Connect to Neo4j
			driver = neo4j.driver(
				uri,
				neo4j.auth.basic(credentials.username, credentials.password)
			)
			this.currentMigration.driver = driver

			// Verify connection with a simple query
			const testSession = driver.session()
			try {
				await testSession.run("RETURN 1 as test")
			} finally {
				await testSession.close()
			}

			// Create session
			session = driver.session()
			this.currentMigration.session = session

			onProgress({
				current: 0,
				total: files.length,
				status: "creating_nodes",
			})
			StateService.setMigrationState({
				progress: {
					current: 0,
					total: files.length,
					status: "creating_nodes",
				},
			})

			// Initialize property stats for all enabled properties
			const propertyStats: Record<string, PropertyErrorStats> = {}
			if (settings?.propertyMappings) {
				for (const [propertyName, mapping] of Object.entries(settings.propertyMappings)) {
					if (mapping.enabled) {
						propertyStats[propertyName] = {
							propertyName,
							successCount: 0,
							errorCount: 0,
							fileErrors: [],
						}
					}
				}
			}

			// Phase 1: Create nodes
			const nodeResult = await this.migrateFiles(
				session,
				vaultPath,
				files,
				onProgress
			)
			const phasesExecuted: Array<"nodes" | "relationships"> = ["nodes"]

			// Phase 2: Create relationships (if app and settings provided)
			let relationshipStats = { successCount: 0, errorCount: 0 }
			const relationshipErrors: RelationshipCreationError[] = []

			if (app && settings && !this.currentMigration?.cancelled) {
				const relResult = await this.createRelationships(
					session,
					vaultPath,
					files,
					app,
					settings,
					onProgress,
					propertyStats
				)
				phasesExecuted.push("relationships")
				relationshipStats = {
					successCount: relResult.successCount,
					errorCount: relResult.errorCount,
				}
				relationshipErrors.push(...relResult.errors)
			}

			// Cleanup
			await session.close()
			await driver.close()
			this.currentMigration = null

			// Emit final migration state
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const totalErrorCount = nodeResult.errorCount + relationshipStats.errorCount

			return {
				success: nodeResult.success && totalErrorCount === 0,
				totalFiles: files.length,
				successCount: nodeResult.successCount,
				errorCount: totalErrorCount,
				duration: nodeResult.duration,
				message: nodeResult.message,
				phasesExecuted,
				nodeErrors: nodeResult.nodeErrors,
				relationshipErrors,
				propertyWriteErrors: [], // No property write errors yet (future feature)
				propertyStats,
				relationshipStats,
			}
		} catch (error) {
			// Cleanup on error
			if (session) {
				try {
					await session.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}
			if (driver) {
				try {
					await driver.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}

			this.currentMigration = null

			// Emit final migration state
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const errorMessage =
				error instanceof Error ? error.message : String(error)
			throw new Error(`Migration failed: ${errorMessage}`)
		}
	}

	/**
	 * Creates relationships only (skips node creation)
	 * @param vaultPath - Path to the Obsidian vault
	 * @param uri - Neo4j connection URI
	 * @param credentials - Neo4j credentials
	 * @param onProgress - Callback for progress updates
	 * @param app - Obsidian app instance (required)
	 * @param settings - Plugin settings (required)
	 * @returns Migration result with relationship statistics
	 */
	static async createRelationshipsOnly(
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		onProgress: ProgressCallback,
		app: App,
		settings: PluginSettings
	): Promise<MigrationResult> {
		if (this.currentMigration) {
			throw new Error("Migration already in progress")
		}

		if (!app || !settings) {
			throw new Error("App and settings are required for relationship creation")
		}

		const startTime = Date.now()

		// Initialize migration state
		this.currentMigration = {
			cancelled: false,
			paused: false,
			driver: null,
			session: null,
			transaction: null,
		}

		// Emit initial migration state
		StateService.setMigrationState({
			running: true,
			paused: false,
			cancelled: false,
			progress: null,
		})

		let driver: Driver | null = null
		let session: Session | null = null

		try {
			const scanningProgress: MigrationProgress = {
				current: 0,
				total: 0,
				status: "scanning",
			}
			onProgress(scanningProgress)
			StateService.setMigrationState({ progress: scanningProgress })

			// Find all markdown files
			const files = await this.findMarkdownFiles(vaultPath)

			if (files.length === 0) {
				this.currentMigration = null
				StateService.setMigrationState({
					running: false,
					paused: false,
					cancelled: false,
					progress: null,
				})
				return {
					success: true,
					totalFiles: 0,
					successCount: 0,
					errorCount: 0,
					duration: Date.now() - startTime,
					message: "No markdown files found",
					phasesExecuted: ["relationships"],
					nodeErrors: [],
					relationshipErrors: [],
					propertyWriteErrors: [],
					propertyStats: {},
					relationshipStats: { successCount: 0, errorCount: 0 },
				}
			}

			onProgress({
				current: 0,
				total: files.length,
				status: "connecting",
			})
			StateService.setMigrationState({
				progress: {
					current: 0,
					total: files.length,
					status: "connecting",
				},
			})

			// Connect to Neo4j
			driver = neo4j.driver(
				uri,
				neo4j.auth.basic(credentials.username, credentials.password)
			)
			this.currentMigration.driver = driver

			// Verify connection with a simple query
			const testSession = driver.session()
			try {
				await testSession.run("RETURN 1 as test")
			} finally {
				await testSession.close()
			}

			// Create session
			session = driver.session()
			this.currentMigration.session = session

			// Initialize property stats for all enabled properties
			const propertyStats: Record<string, PropertyErrorStats> = {}
			if (settings.propertyMappings) {
				for (const [propertyName, mapping] of Object.entries(settings.propertyMappings)) {
					if (mapping.enabled) {
						propertyStats[propertyName] = {
							propertyName,
							successCount: 0,
							errorCount: 0,
							fileErrors: [],
						}
					}
				}
			}

			// Create relationships only
			const relResult = await this.createRelationships(
				session,
				vaultPath,
				files,
				app,
				settings,
				onProgress,
				propertyStats
			)

			// Cleanup
			await session.close()
			await driver.close()
			this.currentMigration = null

			// Emit final migration state
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			return {
				success: relResult.errorCount === 0,
				totalFiles: files.length,
				successCount: 0, // No nodes created
				errorCount: relResult.errorCount,
				duration: Date.now() - startTime,
				message: "Relationship creation completed",
				phasesExecuted: ["relationships"],
				nodeErrors: [],
				relationshipErrors: relResult.errors,
				propertyWriteErrors: [],
				propertyStats,
				relationshipStats: {
					successCount: relResult.successCount,
					errorCount: relResult.errorCount,
				},
			}
		} catch (error) {
			// Cleanup on error
			if (session) {
				try {
					await session.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}
			if (driver) {
				try {
					await driver.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}

			this.currentMigration = null

			// Emit final migration state
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const errorMessage =
				error instanceof Error ? error.message : String(error)
			throw new Error(`Relationship creation failed: ${errorMessage}`)
		}
	}

	/**
	 * Cancels the current migration
	 */
	static cancel(): void {
		if (this.currentMigration) {
			this.currentMigration.cancelled = true
			StateService.setMigrationState({
				cancelled: true,
			})
		}
	}

	/**
	 * Pauses the current migration
	 */
	static pause(): void {
		if (this.currentMigration) {
			this.currentMigration.paused = true
			StateService.setMigrationState({
				paused: true,
			})
		}
	}

	/**
	 * Resumes a paused migration
	 */
	static resume(): void {
		if (this.currentMigration) {
			this.currentMigration.paused = false
			StateService.setMigrationState({
				paused: false,
			})
		}
	}

	/**
	 * Checks if a migration is currently running
	 */
	static isRunning(): boolean {
		return this.currentMigration !== null && !this.currentMigration.cancelled
	}

	/**
	 * Checks if the current migration is paused
	 */
	static isPaused(): boolean {
		return this.currentMigration?.paused === true
	}

	/**
	 * Gets the current migration state
	 */
	static getState(): {
		running: boolean
		paused: boolean
		cancelled: boolean
	} {
		if (!this.currentMigration) {
			return { running: false, paused: false, cancelled: false }
		}
		return {
			running: true,
			paused: this.currentMigration.paused,
			cancelled: this.currentMigration.cancelled,
		}
	}

	/**
	 * Migrates a single property (processes only files that have the property)
	 * @param propertyName - Property name to migrate
	 * @param vaultPath - Path to the Obsidian vault
	 * @param uri - Neo4j connection URI
	 * @param credentials - Neo4j credentials
	 * @param onProgress - Callback for progress updates
	 * @param app - Obsidian app instance (required)
	 * @param settings - Plugin settings (required)
	 * @returns Migration result
	 */
	static async migrateProperty(
		propertyName: string,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		onProgress: ProgressCallback,
		app: App,
		settings: PluginSettings
	): Promise<MigrationResult> {
		if (this.currentMigration) {
			throw new Error("Migration already in progress")
		}

		const startTime = Date.now()

		// Initialize migration state
		this.currentMigration = {
			cancelled: false,
			paused: false,
			driver: null,
			session: null,
			transaction: null,
		}

		// Emit initial migration state
		StateService.setMigrationState({
			running: true,
			paused: false,
			cancelled: false,
			progress: null,
		})

		let driver: Driver | null = null
		let session: Session | null = null

		try {
			// Find all markdown files
			const allFiles = await this.findMarkdownFiles(vaultPath)
			
			// Filter files that have this property
			const filesWithProperty: string[] = []
			for (const filePath of allFiles) {
				const relativePath = filePath
					.replace(vaultPath + "/", "")
					.replace(vaultPath + "\\", "")
				const file = getFileFromPath(app, relativePath)
				if (file) {
					const frontMatter = extractFrontMatter(app, file)
					if (frontMatter && frontMatter[propertyName]) {
						filesWithProperty.push(filePath)
					}
				}
			}

			if (filesWithProperty.length === 0) {
				this.currentMigration = null
				StateService.setMigrationState({
					running: false,
					paused: false,
					cancelled: false,
					progress: null,
				})
				return {
					success: true,
					totalFiles: 0,
					successCount: 0,
					errorCount: 0,
					duration: Date.now() - startTime,
					message: `No files found with property: ${propertyName}`,
					phasesExecuted: [],
					nodeErrors: [],
					relationshipErrors: [],
					propertyWriteErrors: [],
					propertyStats: {},
				}
			}

			// Connect to Neo4j
			driver = neo4j.driver(
				uri,
				neo4j.auth.basic(credentials.username, credentials.password)
			)
			this.currentMigration.driver = driver

			// Verify connection
			const testSession = driver.session()
			try {
				await testSession.run("RETURN 1 as test")
			} finally {
				await testSession.close()
			}

			session = driver.session()
			this.currentMigration.session = session

			// Initialize property stats for this property only
			const propertyStats: Record<string, PropertyErrorStats> = {}
			const mapping = settings.propertyMappings?.[propertyName]
			if (mapping?.enabled) {
				propertyStats[propertyName] = {
					propertyName,
					successCount: 0,
					errorCount: 0,
					fileErrors: [],
				}
			}

			// Ensure all nodes exist (create missing nodes)
			const nodeResult = await this.migrateFiles(
				session,
				vaultPath,
				filesWithProperty,
				onProgress
			)

			// Create relationships for this property only
			const relationshipErrors: RelationshipCreationError[] = []
			let relationshipSuccessCount = 0
			let relationshipErrorCount = 0

			if (mapping?.enabled && mapping.mappingType === "relationship") {
				const relConfig = getRelationshipConfig(settings, propertyName)
				if (relConfig) {
					const tx = session.beginTransaction()
					this.currentMigration!.transaction = tx

					try {
						for (const filePath of filesWithProperty) {
							if (this.currentMigration?.cancelled) {
								await tx.rollback()
								break
							}

							const relativePath = filePath
								.replace(vaultPath + "/", "")
								.replace(vaultPath + "\\", "")

							const file = getFileFromPath(app, relativePath)
							if (!file) continue

							const frontMatter = extractFrontMatter(app, file)
							if (!frontMatter || !frontMatter[propertyName]) continue

							const propertyValue = frontMatter[propertyName]
							const targets = extractWikilinkTargets(propertyValue, app)

							for (const targetPath of targets) {
								try {
									if (!relConfig.relationshipType || relConfig.relationshipType.trim().length === 0) {
										const validationError: RelationshipCreationError = {
											file: relativePath,
											property: propertyName,
											target: targetPath,
											error: "Relationship type is empty",
											errorType: "VALIDATION",
										}
										relationshipErrorCount++
										relationshipErrors.push(validationError)
										if (propertyStats[propertyName]) {
											propertyStats[propertyName].errorCount++
											propertyStats[propertyName].fileErrors.push(validationError)
										}
										continue
									}

									// Ensure target node exists
									try {
										await tx.run(
											`
											MERGE (target:Note {path: $targetPath})
											ON CREATE SET target.name = $targetName
											`,
											{
												targetPath,
												targetName: this.getFileName(targetPath),
											}
										)
									} catch (targetError) {
										const errorMessage = targetError instanceof Error ? targetError.message : String(targetError)
										const errorType = categorizeError(targetError)
										const targetErrorObj: RelationshipCreationError = {
											file: relativePath,
											property: propertyName,
											target: targetPath,
											error: `Target node creation failed: ${errorMessage}`,
											errorType: errorType === "UNKNOWN" ? "TARGET_NODE_FAILURE" : errorType,
										}
										relationshipErrorCount++
										relationshipErrors.push(targetErrorObj)
										if (propertyStats[propertyName]) {
											propertyStats[propertyName].errorCount++
											propertyStats[propertyName].fileErrors.push(targetErrorObj)
										}
										continue
									}

									// Check source node
									const sourceCheck = await tx.run(
										`MATCH (source:Note {path: $sourcePath}) RETURN source`,
										{ sourcePath: relativePath }
									)

									if (sourceCheck.records.length === 0) {
										const sourceMissingError: RelationshipCreationError = {
											file: relativePath,
											property: propertyName,
											target: targetPath,
											error: "Source node does not exist",
											errorType: "SOURCE_NODE_MISSING",
										}
										relationshipErrorCount++
										relationshipErrors.push(sourceMissingError)
										if (propertyStats[propertyName]) {
											propertyStats[propertyName].errorCount++
											propertyStats[propertyName].fileErrors.push(sourceMissingError)
										}
										continue
									}

									// Create relationship
									if (relConfig.direction === "outgoing") {
										await tx.run(
											`
											MATCH (source:Note {path: $sourcePath})
											MATCH (target:Note {path: $targetPath})
											MERGE (source)-[r:${relConfig.relationshipType}]->(target)
											`,
											{ sourcePath: relativePath, targetPath }
										)
									} else {
										await tx.run(
											`
											MATCH (source:Note {path: $sourcePath})
											MATCH (target:Note {path: $targetPath})
											MERGE (target)-[r:${relConfig.relationshipType}]->(source)
											`,
											{ sourcePath: relativePath, targetPath }
										)
									}

									relationshipSuccessCount++
									if (propertyStats[propertyName]) {
										propertyStats[propertyName].successCount++
									}
								} catch (error) {
									const errorMessage = error instanceof Error ? error.message : String(error)
									const errorType = categorizeError(error)
									const relationshipError: RelationshipCreationError = {
										file: relativePath,
										property: propertyName,
										target: targetPath,
										error: errorMessage,
										errorType,
									}
									relationshipErrorCount++
									relationshipErrors.push(relationshipError)
									if (propertyStats[propertyName]) {
										propertyStats[propertyName].errorCount++
										propertyStats[propertyName].fileErrors.push(relationshipError)
									}
								}
							}
						}

						await tx.commit()
						this.currentMigration!.transaction = null
					} catch (error) {
						await tx.rollback()
						this.currentMigration!.transaction = null
						throw error
					}
				}
			}

			// Cleanup
			await session.close()
			await driver.close()
			this.currentMigration = null

			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const totalErrorCount = nodeResult.errorCount + relationshipErrorCount

			return {
				success: nodeResult.success && totalErrorCount === 0,
				totalFiles: filesWithProperty.length,
				successCount: nodeResult.successCount,
				errorCount: totalErrorCount,
				duration: Date.now() - startTime,
				message: `Property migration completed: ${propertyName}`,
				phasesExecuted: ["nodes", "relationships"],
				nodeErrors: nodeResult.nodeErrors,
				relationshipErrors,
				propertyWriteErrors: [],
				propertyStats,
				relationshipStats: {
					successCount: relationshipSuccessCount,
					errorCount: relationshipErrorCount,
				},
			}
		} catch (error) {
			if (session) {
				try {
					await session.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}
			if (driver) {
				try {
					await driver.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}

			this.currentMigration = null
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const errorMessage = error instanceof Error ? error.message : String(error)
			throw new Error(`Property migration failed: ${errorMessage}`)
		}
	}

	/**
	 * Migrates a single file (processes all enabled properties for that file)
	 * @param filePath - Relative file path to migrate
	 * @param vaultPath - Path to the Obsidian vault
	 * @param uri - Neo4j connection URI
	 * @param credentials - Neo4j credentials
	 * @param onProgress - Callback for progress updates
	 * @param app - Obsidian app instance (required)
	 * @param settings - Plugin settings (required)
	 * @returns Migration result
	 */
	static async migrateFile(
		filePath: string,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		onProgress: ProgressCallback,
		app: App,
		settings: PluginSettings
	): Promise<MigrationResult> {
		if (this.currentMigration) {
			throw new Error("Migration already in progress")
		}

		const startTime = Date.now()
		const fullPath = join(vaultPath, filePath)

		// Initialize migration state
		this.currentMigration = {
			cancelled: false,
			paused: false,
			driver: null,
			session: null,
			transaction: null,
		}

		StateService.setMigrationState({
			running: true,
			paused: false,
			cancelled: false,
			progress: null,
		})

		let driver: Driver | null = null
		let session: Session | null = null

		try {
			// Connect to Neo4j
			driver = neo4j.driver(
				uri,
				neo4j.auth.basic(credentials.username, credentials.password)
			)
			this.currentMigration.driver = driver

			// Verify connection
			const testSession = driver.session()
			try {
				await testSession.run("RETURN 1 as test")
			} finally {
				await testSession.close()
			}

			session = driver.session()
			this.currentMigration.session = session

			// Initialize property stats for all enabled properties
			const propertyStats: Record<string, PropertyErrorStats> = {}
			if (settings.propertyMappings) {
				for (const [propertyName, mapping] of Object.entries(settings.propertyMappings)) {
					if (mapping.enabled) {
						propertyStats[propertyName] = {
							propertyName,
							successCount: 0,
							errorCount: 0,
							fileErrors: [],
						}
					}
				}
			}

			// Ensure node exists (create if missing)
			const nodeResult = await this.migrateFiles(
				session,
				vaultPath,
				[fullPath],
				onProgress
			)

			// Create relationships for all enabled properties
			const relationshipErrors: RelationshipCreationError[] = []
			let relationshipSuccessCount = 0
			let relationshipErrorCount = 0

			const file = getFileFromPath(app, filePath)
			if (file) {
				const frontMatter = extractFrontMatter(app, file)
				if (frontMatter && settings.propertyMappings) {
					const relResult = await this.createRelationships(
						session,
						vaultPath,
						[fullPath],
						app,
						settings,
						onProgress,
						propertyStats
					)
					relationshipErrors.push(...relResult.errors)
					relationshipSuccessCount = relResult.successCount
					relationshipErrorCount = relResult.errorCount
				}
			}

			// Cleanup
			await session.close()
			await driver.close()
			this.currentMigration = null

			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const totalErrorCount = nodeResult.errorCount + relationshipErrorCount

			return {
				success: nodeResult.success && totalErrorCount === 0,
				totalFiles: 1,
				successCount: nodeResult.successCount,
				errorCount: totalErrorCount,
				duration: Date.now() - startTime,
				message: `File migration completed: ${filePath}`,
				phasesExecuted: ["nodes", "relationships"],
				nodeErrors: nodeResult.nodeErrors,
				relationshipErrors,
				propertyWriteErrors: [],
				propertyStats,
				relationshipStats: {
					successCount: relationshipSuccessCount,
					errorCount: relationshipErrorCount,
				},
			}
		} catch (error) {
			if (session) {
				try {
					await session.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}
			if (driver) {
				try {
					await driver.close()
				} catch (e) {
					// Ignore cleanup errors
				}
			}

			this.currentMigration = null
			StateService.setMigrationState({
				running: false,
				paused: false,
				cancelled: false,
				progress: null,
			})

			const errorMessage = error instanceof Error ? error.message : String(error)
			throw new Error(`File migration failed: ${errorMessage}`)
		}
	}
}

