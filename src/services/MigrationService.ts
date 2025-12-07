import { readdir } from "fs/promises"
import { join } from "path"
import neo4j, { Driver, Session, Transaction } from "neo4j-driver"
import type { Neo4jCredentials, RelationshipError } from "../types"
import { StateService } from "./StateService"

export interface MigrationProgress {
	current: number
	total: number
	status: string
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
						status: "migrating",
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
						status: "migrating",
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
	 * Runs migration from vault to Neo4j
	 * @param vaultPath - Path to the Obsidian vault
	 * @param uri - Neo4j connection URI
	 * @param credentials - Neo4j credentials
	 * @param onProgress - Callback for progress updates
	 * @returns Migration result
	 */
	static async migrate(
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		onProgress: ProgressCallback
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
				status: "migrating",
			})
			StateService.setMigrationState({
				progress: {
					current: 0,
					total: files.length,
					status: "migrating",
				},
			})

			// Run migration
			const result = await this.migrateFiles(
				session,
				vaultPath,
				files,
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

			return result
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

