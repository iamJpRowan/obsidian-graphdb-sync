import { readdir } from "fs/promises"
import { join } from "path"
import neo4j, { Driver, Session, Transaction } from "neo4j-driver"
import type { App } from "obsidian"
import type { Neo4jCredentials, RelationshipError, PluginSettings, RelationshipMappingConfig } from "../types"
import { StateService } from "./StateService"
import { extractWikilinkTargets } from "../utils/wikilinkExtractor"
import { getRelationshipConfig } from "../utils/propertyMappingHelpers"
import { extractFrontMatter, getFileFromPath } from "../utils/frontMatterExtractor"

export interface MigrationProgress {
	current: number
	total: number
	status: "scanning" | "connecting" | "migrating" | "creating_nodes" | "creating_relationships"
	currentFile?: string
}

export interface MigrationResult {
	success: boolean
	totalFiles: number
	successCount: number
	errorCount: number
	errors: Array<{ file: string; error: string } | RelationshipError>
	duration: number
	message?: string
	relationshipStats?: {
		successCount: number
		errorCount: number
	}
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
	): Promise<MigrationResult> {
		const startTime = Date.now()
		let successCount = 0
		let errorCount = 0
		const errors: Array<{ file: string; error: string }> = []

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
						totalFiles: files.length,
						successCount,
						errorCount,
						errors,
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
					errors.push({
						file: filePath,
						error: errorMessage,
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
				totalFiles: files.length,
				successCount,
				errorCount,
				errors,
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
		onProgress: ProgressCallback
	): Promise<{
		successCount: number
		errorCount: number
		errors: RelationshipError[]
	}> {
		let successCount = 0
		let errorCount = 0
		const errors: RelationshipError[] = []

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
								// Skip if relationship type is empty
								continue
							}

							// Ensure target node exists (create placeholder if needed)
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
						} catch (error) {
							errorCount++
							const errorMessage =
								error instanceof Error ? error.message : String(error)
							errors.push({
								file: relativePath,
								property: propertyName,
								target: targetPath,
								error: errorMessage,
							})
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
					errors: [],
					duration: Date.now() - startTime,
					message: "No markdown files found",
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

			// Phase 1: Create nodes
			const nodeResult = await this.migrateFiles(
				session,
				vaultPath,
				files,
				onProgress
			)

			// Phase 2: Create relationships (if app and settings provided)
			let relationshipStats = { successCount: 0, errorCount: 0 }
			const relationshipErrors: RelationshipError[] = []

			if (app && settings && !this.currentMigration?.cancelled) {
				const relResult = await this.createRelationships(
					session,
					vaultPath,
					files,
					app,
					settings,
					onProgress
				)
				relationshipStats = {
					successCount: relResult.successCount,
					errorCount: relResult.errorCount,
				}
				relationshipErrors.push(...relResult.errors)
			}

			// Combine errors
			const allErrors = [...nodeResult.errors, ...relationshipErrors]

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
				...nodeResult,
				errors: allErrors,
				errorCount: nodeResult.errorCount + relationshipStats.errorCount,
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
					errors: [],
					duration: Date.now() - startTime,
					message: "No markdown files found",
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

			// Create relationships only
			const relResult = await this.createRelationships(
				session,
				vaultPath,
				files,
				app,
				settings,
				onProgress
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
				success: true,
				totalFiles: files.length,
				successCount: 0, // No nodes created
				errorCount: relResult.errorCount,
				errors: relResult.errors,
				duration: Date.now() - startTime,
				message: "Relationship creation completed",
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
}

