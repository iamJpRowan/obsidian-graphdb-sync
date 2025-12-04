import neo4j, { Driver } from "neo4j-driver"
import type { Neo4jCredentials } from "../types"

/**
 * Service for managing Neo4j connections
 */
export class Neo4jService {
	/**
	 * Tests a Neo4j connection with the provided credentials
	 * @param uri - Neo4j connection URI
	 * @param credentials - Username and password
	 * @returns Promise that resolves if connection successful, rejects with error message if failed
	 */
	static async testConnection(
		uri: string,
		credentials: Neo4jCredentials
	): Promise<void> {
		if (!uri) {
			throw new Error("Neo4j URI is required")
		}

		if (!credentials.username || !credentials.password) {
			throw new Error("Username and password are required")
		}

		let driver: Driver | null = null

		try {
			// Create driver
			driver = neo4j.driver(
				uri,
				neo4j.auth.basic(credentials.username, credentials.password)
			)

			// Test connection with a simple query (verifies both connectivity and authentication)
			const session = driver.session()
			try {
				await session.run("RETURN 1 as test")
			} finally {
				await session.close()
			}
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Connection failed: ${error.message}`)
			}
			throw new Error(`Connection failed: ${String(error)}`)
		} finally {
			if (driver) {
				await driver.close()
			}
		}
	}
}

