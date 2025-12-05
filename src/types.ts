export interface PluginSettings {
	neo4jUri: string
	neo4jUsername: string
	// Password is stored in session only (cleared when Obsidian closes)
	lastMigrationResult?: {
		success: boolean
		totalFiles: number
		successCount: number
		errorCount: number
		errors: Array<{ file: string; error: string }>
		duration: number
		message?: string
		timestamp: number
	}
}

export interface Neo4jCredentials {
	username: string
	password: string
}

export const DEFAULT_SETTINGS: PluginSettings = {
	neo4jUri: "neo4j://localhost:7687",
	neo4jUsername: "neo4j",
}
