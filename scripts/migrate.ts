import * as dotenv from "dotenv"
import { readdir, stat } from "fs/promises"
import { join } from "path"
import neo4j, { Driver, Session } from "neo4j-driver"

// Load environment variables
dotenv.config()

interface MigrationConfig {
	vaultPath: string
	neo4jUri: string
	neo4jUsername: string
	neo4jPassword: string
}

/**
 * Loads configuration from environment variables
 */
function loadConfig(): MigrationConfig {
	const vaultPath = process.env.VAULT_PATH
	const neo4jUri = process.env.NEO4J_URI
	const neo4jUsername = process.env.NEO4J_USERNAME
	const neo4jPassword = process.env.NEO4J_PASSWORD

	if (!vaultPath) {
		throw new Error("VAULT_PATH environment variable is required")
	}
	if (!neo4jUri) {
		throw new Error("NEO4J_URI environment variable is required")
	}
	if (!neo4jUsername) {
		throw new Error("NEO4J_USERNAME environment variable is required")
	}
	if (!neo4jPassword) {
		throw new Error("NEO4J_PASSWORD environment variable is required")
	}

	return {
		vaultPath,
		neo4jUri,
		neo4jUsername,
		neo4jPassword,
	}
}

/**
 * Recursively finds all .md files in a directory
 */
async function findMarkdownFiles(dir: string): Promise<string[]> {
	const files: string[] = []
	const entries = await readdir(dir, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = join(dir, entry.name)

		// Skip hidden directories (like .obsidian)
		if (entry.isDirectory() && entry.name.startsWith(".")) {
			continue
		}

		if (entry.isDirectory()) {
			const subFiles = await findMarkdownFiles(fullPath)
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
function getFileName(path: string): string {
	const fileName = path.split(/[/\\]/).pop() || ""
	return fileName.replace(/\.md$/, "")
}

/**
 * Migrates all markdown files to Neo4j
 */
async function migrateFiles(
	session: Session,
	vaultPath: string,
	files: string[]
): Promise<void> {
	console.log(`Migrating ${files.length} files to Neo4j...`)

	let successCount = 0
	let errorCount = 0

	// Use a transaction for batch operations
	const tx = session.beginTransaction()

	try {
		for (const filePath of files) {
			try {
				// Get relative path from vault root
				const relativePath = filePath.replace(vaultPath + "/", "").replace(vaultPath + "\\", "")
				const fileName = getFileName(filePath)

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
				// Update progress on the same line
				process.stdout.write(
					`\r  Processed ${successCount}/${files.length} files...`
				)
			} catch (error) {
				console.error(`Error processing file ${filePath}:`, error)
				errorCount++
			}
		}

		await tx.commit()
		// Clear the progress line and print final results
		process.stdout.write(`\r${" ".repeat(50)}\r`)
		console.log(`Migration complete!`)
		console.log(`  Success: ${successCount}`)
		if (errorCount > 0) {
			console.log(`  Errors: ${errorCount}`)
		}
	} catch (error) {
		await tx.rollback()
		throw error
	}
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
	try {
		const config = loadConfig()
		console.log("Starting migration...")
		console.log(`Vault path: ${config.vaultPath}`)
		console.log(`Neo4j URI: ${config.neo4jUri}`)

		// Verify vault path exists
		const vaultStats = await stat(config.vaultPath)
		if (!vaultStats.isDirectory()) {
			throw new Error(`Vault path is not a directory: ${config.vaultPath}`)
		}

		// Find all markdown files
		console.log("Scanning for markdown files...")
		const files = await findMarkdownFiles(config.vaultPath)
		console.log(`Found ${files.length} markdown files`)

		if (files.length === 0) {
			console.log("No markdown files found. Exiting.")
			return
		}

		// Connect to Neo4j
		console.log("Connecting to Neo4j...")
		const driver: Driver = neo4j.driver(
			config.neo4jUri,
			neo4j.auth.basic(config.neo4jUsername, config.neo4jPassword)
		)

		try {
			// Verify connection
			await driver.verifyConnectivity()
			console.log("Connected to Neo4j successfully")

			// Run migration
			const session = driver.session()
			try {
				await migrateFiles(session, config.vaultPath, files)
			} finally {
				await session.close()
			}
		} finally {
			await driver.close()
		}
	} catch (error) {
		console.error("Migration failed:", error)
		process.exit(1)
	}
}

// Run migration
main()

