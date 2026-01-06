import type GraphDBSyncPlugin from "../main"
import type {
	SyncItem,
	PropertySyncItem,
	RelationshipSyncItem,
	LabelSyncItem,
	PluginSettings,
	Neo4jCredentials,
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
		type: "property-sync" | "relationship-sync",
		settings: PluginSettings
	): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Check if full sync exists (large Set of properties = full sync)
		// Full syncs are identified by having all enabled properties
		const fullSync = this.findFullSync(queue, type, settings)
		if (fullSync) {
			// Full sync exists, add property to it if not already included
			const propsSet = fullSync.properties instanceof Set ? fullSync.properties : new Set(fullSync.properties)
			if (!propsSet.has(propertyName)) {
				if (fullSync.properties instanceof Set) {
					fullSync.properties.add(propertyName)
				} else {
					fullSync.properties = new Set([...fullSync.properties, propertyName])
				}
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
			if (existing.properties instanceof Set) {
				existing.properties.add(propertyName)
			} else {
				// Convert to Set if it's an array (shouldn't happen in queue, but safety check)
				const existingSet = new Set(existing.properties)
				existingSet.add(propertyName)
				existing.properties = existingSet
			}
		} else {
			// Add new item to end of queue
			const newItem: SyncItem = type === "property-sync" ? {
				id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				type: "property-sync",
				properties: new Set([propertyName]),
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				nodesCreated: null,
				nodesUpdated: null,
				propertiesSet: null,
				errors: [],
				nodeErrors: [],
			} : {
				id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				type: "relationship-sync",
				properties: new Set([propertyName]),
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				relationshipsCreated: null,
				relationshipsUpdated: null,
				relationshipStats: null,
				relationshipPropertyCounts: null,
				errors: [],
				relationshipErrors: [],
			}
			queue.push(newItem)
		}

		StateService.setQueueState({ queue })
		this.startProcessing(settings)
	}

	/**
	 * Adds a label sync to the queue
	 * Merges with existing label-sync item if one exists
	 */
	static addLabelSync(
		labelName: string,
		settings: PluginSettings
	): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Check if full sync exists (contains all labels)
		const fullSync = this.findFullLabelSync(queue, settings)
		if (fullSync) {
			// Full sync exists, add label to it if not already included
			const labelsSet = fullSync.properties instanceof Set ? fullSync.properties : new Set(fullSync.properties)
			if (!labelsSet.has(labelName)) {
				if (fullSync.properties instanceof Set) {
					fullSync.properties.add(labelName)
				} else {
					fullSync.properties = new Set([...fullSync.properties, labelName])
				}
				StateService.setQueueState({ queue })
			}
			// Label already in full sync or will be covered, skip adding
			return
		}

		// Find existing label-sync item
		const existing = queue.find(
			(item) => item.type === "label-sync"
		)

		if (existing) {
			// Add label to existing item (Set auto-deduplicates)
			if (existing.properties instanceof Set) {
				existing.properties.add(labelName)
			} else {
				// Convert to Set if it's an array (shouldn't happen in queue, but safety check)
				const existingSet = new Set(existing.properties)
				existingSet.add(labelName)
				existing.properties = existingSet
			}
		} else {
			// Add new item to end of queue
			const newItem: LabelSyncItem = {
				id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				type: "label-sync",
				properties: new Set([labelName]),
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				labelsApplied: null,
				errors: [],
				labelErrors: [],
			}
			queue.push(newItem)
		}

		StateService.setQueueState({ queue })
		this.startProcessing(settings)
	}

	/**
	 * Finds a full label sync item in the queue
	 * Full syncs are identified by having all label rules
	 */
	private static findFullLabelSync(
		queue: SyncItem[],
		settings: PluginSettings
	): LabelSyncItem | undefined {
		const allLabelNames = ConfigurationService.getLabelRules(settings).map(r => r.labelName)

		// Find queue item that contains all labels (or more)
		return queue.find((item) => {
			if (item.type !== "label-sync") {
				return false
			}
			// Check if this item contains all labels (it's a full sync)
			const labelsSet = item.properties instanceof Set ? item.properties : new Set(item.properties)
			return allLabelNames.every(label => labelsSet.has(label))
		}) as LabelSyncItem | undefined
	}

	/**
	 * Adds a full sync to the queue (property-sync then relationship-sync then label-sync)
	 * Full syncs use a Set of all currently enabled properties/labels
	 */
	static addFullSync(settings: PluginSettings): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Get all enabled properties for each type
		const enabledNodeProperties = ConfigurationService.getEnabledNodePropertyMappings(settings)
		const enabledRelationshipProperties = ConfigurationService.getEnabledRelationshipMappings(settings)
		const allLabelRules = ConfigurationService.getLabelRules(settings)

		const nodePropertyNames = new Set(enabledNodeProperties.map(m => m.propertyName))
		const relationshipPropertyNames = new Set(enabledRelationshipProperties.map(m => m.propertyName))
		const labelNames = new Set(allLabelRules.map(r => r.labelName))

		// Check if full syncs already exist
		const existingPropertySync = this.findFullSync(queue, "property-sync", settings)
		const existingRelationshipSync = this.findFullSync(queue, "relationship-sync", settings)
		const existingLabelSync = this.findFullLabelSync(queue, settings)

		// Add property-sync if not already queued
		if (!existingPropertySync) {
			const newItem: SyncItem = {
				id: `queue-${Date.now()}-property`,
				type: "property-sync",
				properties: nodePropertyNames,
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				nodesCreated: null,
				nodesUpdated: null,
				propertiesSet: null,
				errors: [],
				nodeErrors: [],
			}
			queue.push(newItem)
			} else {
				// Update existing full sync with any newly enabled properties
				if (existingPropertySync.properties instanceof Set) {
					const propsSet = existingPropertySync.properties
					nodePropertyNames.forEach(prop => propsSet.add(prop))
				} else {
					const existingSet = new Set(existingPropertySync.properties)
					nodePropertyNames.forEach(prop => existingSet.add(prop))
					existingPropertySync.properties = existingSet
				}
			}

		// Add relationship-sync if not already queued
		if (!existingRelationshipSync) {
			const newItem: SyncItem = {
				id: `queue-${Date.now()}-relationship`,
				type: "relationship-sync",
				properties: relationshipPropertyNames,
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				relationshipsCreated: null,
				relationshipsUpdated: null,
				relationshipStats: null,
				relationshipPropertyCounts: null,
				errors: [],
				relationshipErrors: [],
			}
			queue.push(newItem)
			} else {
				// Update existing full sync with any newly enabled properties
				if (existingRelationshipSync.properties instanceof Set) {
					const propsSet = existingRelationshipSync.properties
					relationshipPropertyNames.forEach(prop => propsSet.add(prop))
				} else {
					const existingSet = new Set(existingRelationshipSync.properties)
					relationshipPropertyNames.forEach(prop => existingSet.add(prop))
					existingRelationshipSync.properties = existingSet
				}
			}

		// Add label-sync if not already queued
		if (!existingLabelSync) {
			const newItem: LabelSyncItem = {
				id: `queue-${Date.now()}-label`,
				type: "label-sync",
				properties: labelNames,
				status: "queued",
				startTime: null,
				timestamp: null,
				success: null,
				duration: null,
				message: null,
				totalFiles: null,
				successCount: null,
				errorCount: null,
				labelsApplied: null,
				errors: [],
				labelErrors: [],
			}
			queue.push(newItem)
		} else {
			// Update existing full sync with any newly added labels
			if (existingLabelSync.properties instanceof Set) {
				const labelsSet = existingLabelSync.properties
				labelNames.forEach(label => labelsSet.add(label))
			} else {
				const existingSet = new Set(existingLabelSync.properties)
				labelNames.forEach(label => existingSet.add(label))
				existingLabelSync.properties = existingSet
			}
		}

		StateService.setQueueState({ queue })
		this.startProcessing(settings)
	}

	/**
	 * Finds a full sync item in the queue
	 * Full syncs are identified by having all enabled properties of that type
	 */
	private static findFullSync(
		queue: SyncItem[],
		type: "property-sync" | "relationship-sync",
		settings: PluginSettings
	): SyncItem | undefined {
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
			const propsSet = item.properties instanceof Set ? item.properties : new Set(item.properties)
			return enabledProperties.every(prop => propsSet.has(prop))
		})
	}

	/**
	 * Adds a property to an active full sync if one exists
	 * Called when a property is enabled after a full sync has started
	 */
	static addPropertyToActiveFullSync(
		propertyName: string,
		type: "property-sync" | "relationship-sync",
		settings: PluginSettings
	): void {
		const queueState = StateService.getQueueState()
		const queue = [...queueState.queue]

		// Check current item
		if (queueState.current && queueState.current.type === type) {
			const fullSync = this.findFullSync([queueState.current], type, settings)
			if (fullSync) {
				const propsSet = fullSync.properties instanceof Set ? fullSync.properties : new Set(fullSync.properties)
				if (!propsSet.has(propertyName)) {
					if (fullSync.properties instanceof Set) {
						fullSync.properties.add(propertyName)
					} else {
						fullSync.properties = new Set([...fullSync.properties, propertyName])
					}
					StateService.setQueueState({ current: queueState.current })
				}
			}
		}

		// Check queue items
		const fullSync = this.findFullSync(queue, type, settings)
		if (fullSync) {
			const propsSet = fullSync.properties instanceof Set ? fullSync.properties : new Set(fullSync.properties)
			if (!propsSet.has(propertyName)) {
				if (fullSync.properties instanceof Set) {
					fullSync.properties.add(propertyName)
				} else {
					fullSync.properties = new Set([...fullSync.properties, propertyName])
				}
				StateService.setQueueState({ queue })
			}
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
		item: SyncItem,
		settings: PluginSettings
	): Promise<void> {
		// Update status to processing
		item.status = "processing"
		item.startTime = Date.now()
		StateService.setQueueState({ current: item })
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
					item as PropertySyncItem,
					vaultPath,
					uri,
					{ username, password },
					app,
					settings
				)
			} else if (item.type === "relationship-sync") {
				await this.processRelationshipSync(
					item as RelationshipSyncItem,
					vaultPath,
					uri,
					{ username, password },
					app,
					settings
				)
			} else if (item.type === "label-sync") {
				await this.processLabelSync(
					item as LabelSyncItem,
					vaultPath,
					uri,
					{ username, password },
					app,
					settings
				)
			}
		} catch (error) {
			// Update item with error state
			const errorMessage =
				error instanceof Error ? error.message : String(error)
			const duration = Date.now() - startTime

			item.status = "error"
			item.timestamp = Date.now()
			item.success = false
			item.duration = duration
			item.message = item.type === "property-sync" 
				? `Property sync failed: ${errorMessage}`
				: item.type === "relationship-sync"
					? `Relationship sync failed: ${errorMessage}`
					: `Label sync failed: ${errorMessage}`
			item.totalFiles = 0
			item.successCount = 0
			item.errorCount = 0

			// Convert properties to array and move to history
			await this.moveToHistory(item)

			throw error
		}
	}

	/**
	 * Processes a property-sync item
	 */
	private static async processPropertySync(
		item: PropertySyncItem,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		app: import("obsidian").App,
		settings: PluginSettings
	): Promise<void> {
		// Convert Set to array for SyncService
		const properties = item.properties instanceof Set 
			? Array.from(item.properties)
			: item.properties

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

		// Update item with results
		// Check if sync was cancelled (check if SyncInfrastructure was cancelled)
		const { SyncInfrastructure } = await import("./SyncService/infrastructure")
		const isCancelled = SyncInfrastructure.isCancelled() ||
			result.message?.toLowerCase().includes("cancelled") ||
			(!result.success && result.message?.toLowerCase().includes("cancel"))
		
		if (isCancelled) {
			item.status = "cancelled"
			item.message = "Cancelled"
		} else {
			item.status = "completed"
			item.message = result.message || "Property sync completed"
		}
		
		item.timestamp = Date.now()
		item.success = result.success
		item.duration = result.duration
		item.totalFiles = result.totalFiles
		item.successCount = result.successCount
		item.errorCount = result.errorCount
		item.nodesCreated = result.nodesCreated ?? null
		item.nodesUpdated = result.nodesUpdated ?? null
		item.propertiesSet = result.propertiesSet ?? null
		item.errors = result.nodeErrors.map((e) => ({
			file: e.file,
			error: e.error,
		}))
		item.nodeErrors = result.nodeErrors

		// Convert properties to array and move to history
		await this.moveToHistory(item)
	}

	/**
	 * Processes a relationship-sync item
	 */
	private static async processRelationshipSync(
		item: RelationshipSyncItem,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		app: import("obsidian").App,
		settings: PluginSettings
	): Promise<void> {
		// Convert Set to array for SyncService
		const properties = item.properties instanceof Set
			? Array.from(item.properties)
			: item.properties

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

		// Update item with results
		// Check if sync was cancelled (check if SyncInfrastructure was cancelled)
		const { SyncInfrastructure } = await import("./SyncService/infrastructure")
		const isCancelled = SyncInfrastructure.isCancelled()
		
		if (isCancelled) {
			item.status = "cancelled"
			item.message = "Cancelled"
		} else {
			item.status = "completed"
			item.message = result.message || "Relationship sync completed"
		}
		
		item.timestamp = Date.now()
		item.success = result.success
		item.duration = result.duration
		item.totalFiles = result.totalFiles
		item.successCount = result.successCount
		item.errorCount = result.errorCount
		item.relationshipsCreated = result.relationshipsCreated ?? null
		item.relationshipsUpdated = result.relationshipsUpdated ?? null
		item.relationshipStats = result.relationshipStats
		item.relationshipPropertyCounts = result.propertyStats || null
		item.errors = result.relationshipErrors.map((e) => ({
			file: e.file,
			property: e.property,
			target: e.target,
			error: e.error,
		}))
		item.relationshipErrors = result.relationshipErrors

		// Convert properties to array and move to history
		await this.moveToHistory(item)
	}

	/**
	 * Processes a label-sync item
	 */
	private static async processLabelSync(
		item: LabelSyncItem,
		vaultPath: string,
		uri: string,
		credentials: Neo4jCredentials,
		app: import("obsidian").App,
		settings: PluginSettings
	): Promise<void> {
		// Convert Set to array for SyncService
		const labels = item.properties instanceof Set 
			? Array.from(item.properties)
			: item.properties

		// Import labelSync operation
		const { syncLabels } = await import("./SyncService/operations/labelSync")

		// Sync labels
		const result = await syncLabels(
			app,
			vaultPath,
			uri,
			credentials,
			settings,
			labels
		)

		// Update item with results
		// Check if sync was cancelled (check if SyncInfrastructure was cancelled)
		const { SyncInfrastructure } = await import("./SyncService/infrastructure")
		const isCancelled = SyncInfrastructure.isCancelled() ||
			result.message?.toLowerCase().includes("cancelled") ||
			(!result.success && result.message?.toLowerCase().includes("cancel"))
		
		if (isCancelled) {
			item.status = "cancelled"
			item.message = "Cancelled"
		} else {
			item.status = "completed"
			item.message = result.message || "Label sync completed"
		}
		
		item.timestamp = Date.now()
		item.success = result.success
		item.duration = result.duration
		item.totalFiles = result.labelsApplied + result.errorCount // Approximate
		item.successCount = result.labelsApplied
		item.errorCount = result.errorCount
		item.labelsApplied = result.labelsApplied
		item.errors = result.errors.map((e) => ({
			file: e.file,
			label: e.label,
			error: e.error,
		}))
		item.labelErrors = result.errors

		// Convert properties to array and move to history
		await this.moveToHistory(item)
	}

	/**
	 * Moves completed item to history
	 */
	private static async moveToHistory(item: SyncItem): Promise<void> {
		if (!this.pluginInstance) {
			console.error("Plugin instance not available, cannot save history")
			return
		}

		// Convert properties Set to Array for persistence
		if (item.properties instanceof Set) {
			item.properties = Array.from(item.properties)
		}

		// Initialize history array if it doesn't exist
		if (!this.pluginInstance.settings.syncHistory) {
			this.pluginInstance.settings.syncHistory = []
		}

		// Add to history (most recent first)
		this.pluginInstance.settings.syncHistory.unshift(item)

		// Limit history size (keep last 50)
		const MAX_HISTORY = 50
		if (this.pluginInstance.settings.syncHistory.length > MAX_HISTORY) {
			this.pluginInstance.settings.syncHistory =
				this.pluginInstance.settings.syncHistory.slice(0, MAX_HISTORY)
		}

		// Clear current item from queue state
		StateService.setQueueState({ current: null })

		await this.pluginInstance.saveSettings()
	}
}

