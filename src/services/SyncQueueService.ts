import type GraphDBSyncPlugin from "../main"
import type {
	SyncQueueItem,
	SyncQueueItemType,
	PluginSettings,
	Neo4jCredentials,
	SyncHistoryEntry,
} from "../types"
import { StateService } from "./StateService"
import { syncNodePropertiesOnly, syncRelationshipsOnly } from "./SyncService"
import type { SyncContext, SyncProgress } from "./SyncService/types"
import { ConfigurationService } from "./ConfigurationService"
import { CredentialService } from "./CredentialService"
import { getVaultPath } from "../utils/obsidianApi"
import { DEFAULT_SETTINGS } from "../types"

/**
 * Service for managing sync queue and processing sync items
 */
export class SyncQueueService {
	private static processing = false
	private static pluginInstance: GraphDBSyncPlugin | null = null

	/**
	 * Initializes the service with plugin instance
	 */
	static initialize(plugin: GraphDBSyncPlugin): void {
		this.pluginInstance = plugin
	}

	/**
	 * Adds a property sync to the queue
	 * Merges with existing property-sync item if one exists for the same type
	 */
	static addPropertySync(
		propertyName: string,
		type: SyncQueueItemType,
		settings: PluginSettings
	): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Check if full sync exists (large Set of properties = full sync)
		// Full syncs are identified by having all enabled properties
		const fullSync = this.findFullSync(queue, type, settings)
		if (fullSync) {
			// Full sync exists, add property to it if not already included
			if (!fullSync.properties.has(propertyName)) {
				fullSync.properties.add(propertyName)
				StateService.setQueueState({ queue })
			}
			// Property already in full sync or will be covered, skip adding
			return
		}

		// Find existing partial sync item of same type
		const existing = queue.find(
			(item) => item.type === type
		)

		if (existing) {
			// Add property to existing item (Set auto-deduplicates)
			existing.properties.add(propertyName)
		} else {
			// Add new item to end of queue
			const newItem: SyncQueueItem = {
				id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				type,
				properties: new Set([propertyName]),
			}
			queue.push(newItem)
		}

		StateService.setQueueState({ queue })
		this.startProcessing(settings)
	}

	/**
	 * Adds a full sync to the queue (property-sync then relationship-sync)
	 * Full syncs use a Set of all currently enabled properties
	 */
	static addFullSync(settings: PluginSettings): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Get all enabled properties for each type
		const enabledNodeProperties = ConfigurationService.getEnabledNodePropertyMappings(settings)
		const enabledRelationshipProperties = ConfigurationService.getEnabledRelationshipMappings(settings)

		const nodePropertyNames = new Set(enabledNodeProperties.map(m => m.propertyName))
		const relationshipPropertyNames = new Set(enabledRelationshipProperties.map(m => m.propertyName))

		// Check if full syncs already exist
		const existingPropertySync = this.findFullSync(queue, "property-sync", settings)
		const existingRelationshipSync = this.findFullSync(queue, "relationship-sync", settings)

		// Add property-sync if not already queued
		if (!existingPropertySync) {
			queue.push({
				id: `queue-${Date.now()}-property`,
				type: "property-sync",
				properties: nodePropertyNames,
			})
		} else {
			// Update existing full sync with any newly enabled properties
			nodePropertyNames.forEach(prop => existingPropertySync.properties.add(prop))
		}

		// Add relationship-sync if not already queued
		if (!existingRelationshipSync) {
			queue.push({
				id: `queue-${Date.now()}-relationship`,
				type: "relationship-sync",
				properties: relationshipPropertyNames,
			})
		} else {
			// Update existing full sync with any newly enabled properties
			relationshipPropertyNames.forEach(prop => existingRelationshipSync.properties.add(prop))
		}

		StateService.setQueueState({ queue })
		this.startProcessing(settings)
	}

	/**
	 * Finds a full sync item in the queue
	 * Full syncs are identified by having all enabled properties of that type
	 */
	private static findFullSync(
		queue: SyncQueueItem[],
		type: SyncQueueItemType,
		settings: PluginSettings
	): SyncQueueItem | undefined {
		// Get all enabled properties for this type
		const enabledProperties = type === "property-sync"
			? ConfigurationService.getEnabledNodePropertyMappings(settings).map(m => m.propertyName)
			: ConfigurationService.getEnabledRelationshipMappings(settings).map(m => m.propertyName)

		// Find queue item that contains all enabled properties (or more)
		return queue.find((item) => {
			if (item.type !== type) {
				return false
			}
			// Check if this item contains all enabled properties (it's a full sync)
			return enabledProperties.every(prop => item.properties.has(prop))
		})
	}

	/**
	 * Adds a property to an active full sync if one exists
	 * Called when a property is enabled after a full sync has started
	 */
	static addPropertyToActiveFullSync(
		propertyName: string,
		type: SyncQueueItemType,
		settings: PluginSettings
	): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Check current item
		if (queueState.current && queueState.current.type === type) {
			const fullSync = this.findFullSync([queueState.current], type, settings)
			if (fullSync && !fullSync.properties.has(propertyName)) {
				fullSync.properties.add(propertyName)
				StateService.setQueueState({ current: queueState.current })
			}
		}

		// Check queue items
		const fullSync = this.findFullSync(queue, type, settings)
		if (fullSync && !fullSync.properties.has(propertyName)) {
			fullSync.properties.add(propertyName)
			StateService.setQueueState({ queue })
		}
	}

	/**
	 * Removes an item from the queue by ID
	 */
	static removeItem(itemId: string): void {
		const queueState = StateService.getQueueState()
		const queue = queueState.queue.filter((item) => item.id !== itemId)
		StateService.setQueueState({ queue })
	}

	/**
	 * Starts processing queue if not already processing
	 */
	private static startProcessing(settings: PluginSettings): void {
		if (this.processing) {
			return
		}
		this.processQueue(settings)
	}

	/**
	 * Processes queue items sequentially
	 */
	private static async processQueue(settings: PluginSettings): Promise<void> {
		if (this.processing) {
			return
		}

		this.processing = true

		while (true) {
			const queueState = StateService.getQueueState()
			const queue = queueState.queue

			if (queue.length === 0) {
				// Queue is empty, stop processing
				StateService.setQueueState({ current: null })
				this.processing = false
				return
			}

			// Get next item from queue
			const item = queue[0]
			const remainingQueue = queue.slice(1)

			// Update state: set current item and remove from queue
			StateService.setQueueState({
				queue: remainingQueue,
				current: item,
			})

			// Process the item
			try {
				await this.processItem(item, settings)
			} catch (error) {
				// Continue processing on error (error is logged in history)
				console.error("Sync queue item failed:", error)
			}

			// Item processing complete, continue to next
		}
	}

	/**
	 * Processes a single queue item
	 */
	private static async processItem(
		item: SyncQueueItem,
		settings: PluginSettings
	): Promise<void> {
		if (!this.pluginInstance) {
			throw new Error("Plugin instance not available")
		}
		const app = this.pluginInstance.app

		// Get credentials
		const password = CredentialService.getPassword()
		if (!password) {
			// Password prompt should be handled by UI before queuing
			throw new Error("Password not available")
		}

		const uri = settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username = settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		const vaultPath = getVaultPath(app)

		const startTime = Date.now()

		try {
			if (item.type === "property-sync") {
				await this.processPropertySync(
					item,
					vaultPath,
					uri,
					{ username, password },
					app,
					settings
				)
			} else if (item.type === "relationship-sync") {
				await this.processRelationshipSync(
					item,
					vaultPath,
					uri,
					{ username, password },
					app,
					settings
				)
			}
		} catch (error) {
			// Create error history entry
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			const duration = Date.now() - startTime

			if (item.type === "property-sync") {
				await this.saveHistoryEntry({
					type: "property-sync",
					id: `sync-${Date.now()}`,
					timestamp: Date.now(),
					success: false,
					duration,
					message: `Property sync failed: ${errorMessage}`,
					properties: Array.from(item.properties),
					totalFiles: 0,
					successCount: 0,
					errorCount: 0,
					errors: [],
				})
			} else {
				await this.saveHistoryEntry({
					type: "relationship-sync",
					id: `sync-${Date.now()}`,
					timestamp: Date.now(),
					success: false,
					duration,
					message: `Relationship sync failed: ${errorMessage}`,
					properties: Array.from(item.properties),
					totalFiles: 0,
					successCount: 0,
					errorCount: 0,
					errors: [],
					relationshipStats: {
						successCount: 0,
						errorCount: 0,
					},
				})
			}

			throw error
		}
	}

	/**
	 * Processes a property-sync item
	 */
	private static async processPropertySync(
		item: SyncQueueItem,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		app: import("obsidian").App,
		settings: PluginSettings
	): Promise<void> {
		// Convert Set to array for SyncService
		const properties = Array.from(item.properties)

		// Create sync context
		const context: SyncContext = {
			vaultPath,
			uri,
			credentials,
			app,
			settings,
			onProgress: (progress: SyncProgress) => {
				StateService.setMigrationState({ progress })
			},
		}

		// Sync node properties only
		const result = await syncNodePropertiesOnly(context, {
			nodePropertyFilter: properties,
		})

		// Create history entry
		await this.saveHistoryEntry({
			type: "property-sync",
			id: `sync-${Date.now()}`,
			timestamp: Date.now(),
			success: result.success,
			duration: result.duration,
			message: result.message || "Property sync completed",
			properties,
			totalFiles: result.totalFiles,
			successCount: result.successCount,
			errorCount: result.errorCount,
			errors: result.nodeErrors.map((e) => ({
				file: e.file,
				error: e.error,
			})),
			nodeErrors: result.nodeErrors,
		})
	}

	/**
	 * Processes a relationship-sync item
	 */
	private static async processRelationshipSync(
		item: SyncQueueItem,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		app: import("obsidian").App,
		settings: PluginSettings
	): Promise<void> {
		// Convert Set to array for SyncService
		const properties = Array.from(item.properties)

		// Create sync context
		const context: SyncContext = {
			vaultPath,
			uri,
			credentials,
			app,
			settings,
			onProgress: (progress: SyncProgress) => {
				StateService.setMigrationState({ progress })
			},
		}

		// Sync relationships only
		const result = await syncRelationshipsOnly(context, {
			relationshipPropertyFilter: properties,
		})

		// Create history entry
		this.saveHistoryEntry({
			type: "relationship-sync",
			id: `sync-${Date.now()}`,
			timestamp: Date.now(),
			success: result.success,
			duration: result.duration,
			message: result.message || "Relationship sync completed",
			properties,
			totalFiles: result.totalFiles,
			successCount: result.successCount,
			errorCount: result.errorCount,
			errors: result.relationshipErrors.map((e) => ({
				file: e.file,
				property: e.property,
				target: e.target,
				error: e.error,
			})),
			relationshipErrors: result.relationshipErrors,
			propertyStats: result.propertyStats,
			relationshipStats: result.relationshipStats,
		})
	}

	/**
	 * Saves history entry to plugin settings
	 */
	private static async saveHistoryEntry(entry: SyncHistoryEntry): Promise<void> {
		if (!this.pluginInstance) {
			console.error("Plugin instance not available, cannot save history")
			return
		}

		// Initialize history array if it doesn't exist
		if (!this.pluginInstance.settings.syncHistory) {
			this.pluginInstance.settings.syncHistory = []
		}

		// Add to history (most recent first)
		this.pluginInstance.settings.syncHistory.unshift(entry)

		// Limit history size (keep last 50)
		const MAX_HISTORY = 50
		if (this.pluginInstance.settings.syncHistory.length > MAX_HISTORY) {
			this.pluginInstance.settings.syncHistory =
				this.pluginInstance.settings.syncHistory.slice(0, MAX_HISTORY)
		}

		await this.pluginInstance.saveSettings()
	}
}

