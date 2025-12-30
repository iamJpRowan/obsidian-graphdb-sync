import { readdir } from "fs/promises"
import { join } from "path"
import neo4j, { Driver, Session, Transaction } from "neo4j-driver"
import type { SyncProgress } from "./types"
import { StateService } from "../StateService"

/**
 * Current sync state
 */
export interface SyncState {
	cancelled: boolean
	paused: boolean
	driver: Driver | null
	session: Session | null
	transaction: Transaction | null
}

/**
 * Infrastructure utilities for sync operations
 */
export class SyncInfrastructure {
	private static currentSync: SyncState | null = null

	/**
	 * Gets the current sync state
	 */
	static getCurrentSync(): SyncState | null {
		return this.currentSync
	}

	/**
	 * Initializes sync state
	 */
	static initializeSync(): void {
		this.currentSync = {
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
	}

	/**
	 * Clears sync state
	 */
	static clearSync(): void {
		this.currentSync = null
		StateService.setMigrationState({
			running: false,
			paused: false,
			cancelled: false,
			progress: null,
		})
	}

	/**
	 * Checks if sync is cancelled
	 */
	static isCancelled(): boolean {
		return this.currentSync?.cancelled === true
	}

	/**
	 * Checks if sync is paused
	 */
	static isPaused(): boolean {
		return this.currentSync?.paused === true
	}

	/**
	 * Waits if paused
	 */
	static async waitIfPaused(): Promise<void> {
		while (this.currentSync?.paused && !this.currentSync?.cancelled) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	/**
	 * Cancels the current sync
	 */
	static cancel(): void {
		if (this.currentSync) {
			this.currentSync.cancelled = true
			StateService.setMigrationState({
				cancelled: true,
			})
		}
	}

	/**
	 * Pauses the current sync
	 */
	static pause(): void {
		if (this.currentSync) {
			this.currentSync.paused = true
			StateService.setMigrationState({
				paused: true,
			})
		}
	}

	/**
	 * Resumes a paused sync
	 */
	static resume(): void {
		if (this.currentSync) {
			this.currentSync.paused = false
			StateService.setMigrationState({
				paused: false,
			})
		}
	}

	/**
	 * Sets the current transaction
	 */
	static setTransaction(transaction: Transaction | null): void {
		if (this.currentSync) {
			this.currentSync.transaction = transaction
		}
	}

	/**
	 * Clears the current transaction reference
	 */
	static clearTransaction(): void {
		if (this.currentSync) {
			this.currentSync.transaction = null
		}
	}

	/**
	 * Recursively finds all .md files in a directory
	 */
	static async findMarkdownFiles(dir: string): Promise<string[]> {
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
	 * Connects to Neo4j and returns driver and session
	 */
	static async connect(
		uri: string,
		credentials: { username: string; password: string },
		onProgress: (progress: SyncProgress) => void
	): Promise<{ driver: Driver; session: Session }> {
		onProgress({
			current: 0,
			total: 0,
			status: "connecting",
		})
		StateService.setMigrationState({
			progress: {
				current: 0,
				total: 0,
				status: "connecting",
			},
		})

		const driver = neo4j.driver(uri, neo4j.auth.basic(credentials.username, credentials.password))
		
		if (this.currentSync) {
			this.currentSync.driver = driver
		}

		// Verify connection with a simple query
		const testSession = driver.session()
		try {
			await testSession.run("RETURN 1 as test")
		} finally {
			await testSession.close()
		}

		const session = driver.session()
		if (this.currentSync) {
			this.currentSync.session = session
		}

		return { driver, session }
	}

	/**
	 * Cleans up driver and session resources
	 */
	static async cleanupDriverAndSession(driver: Driver | null, session: Session | null): Promise<void> {
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
	}
}

