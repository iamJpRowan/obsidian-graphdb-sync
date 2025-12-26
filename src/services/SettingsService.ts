import type GraphDBSyncPlugin from "../main"
import type { PluginSettings, NodeLabelConfig } from "../types"
import { DEFAULT_SETTINGS } from "../types"

/**
 * Service for managing plugin settings
 */
export class SettingsService {
	/**
	 * Gets node label configuration
	 */
	static getNodeLabelConfig(settings: PluginSettings): NodeLabelConfig {
		// For now, return empty config. This will be extended when we add node label support
		return settings.nodeLabelConfig || {
			tags: [],
			folders: [],
		}
	}

	/**
	 * Updates node label configuration
	 */
	static async updateNodeLabelConfig(
		plugin: GraphDBSyncPlugin,
		config: NodeLabelConfig
	): Promise<void> {
		plugin.settings.nodeLabelConfig = config
		await plugin.saveSettings()
	}

	/**
	 * Updates connection settings
	 */
	static async updateConnectionSettings(
		plugin: GraphDBSyncPlugin,
		uri: string,
		username: string
	): Promise<void> {
		plugin.settings.neo4jUri = uri || DEFAULT_SETTINGS.neo4jUri
		plugin.settings.neo4jUsername = username || DEFAULT_SETTINGS.neo4jUsername
		await plugin.saveSettings()
	}

	/**
	 * Ensures password is available, prompting if needed
	 * Returns password if available, null if user cancelled
	 */
	static async ensurePassword(
		plugin: GraphDBSyncPlugin,
		promptCallback: () => Promise<string | null>
	): Promise<string | null> {
		const { CredentialService } = await import("./CredentialService")
		
		// Check if password is already set
		if (CredentialService.hasPassword()) {
			return CredentialService.getPassword()
		}

		// Prompt for password
		const password = await promptCallback()
		if (password) {
			CredentialService.setSessionPassword(password)
		}

		return password
	}
}


