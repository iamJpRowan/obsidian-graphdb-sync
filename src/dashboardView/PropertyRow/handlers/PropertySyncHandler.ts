import { Notice } from "obsidian"
import type GraphDBSyncPlugin from "../../../main"
import { SyncQueueService } from "../../../services/SyncQueueService"
import { StateService } from "../../../services/StateService"
import { ConfigurationService } from "../../../services/ConfigurationService"
import { CredentialService } from "../../../services/CredentialService"
import { PasswordPrompt } from "../../components/PasswordPrompt"
import { getPropertyRowState } from "../utils/PropertyRowState"

/**
 * Sync handler component
 * Handles sync button clicks and queue state for property rows
 */
export class PropertySyncHandler {
	private plugin: GraphDBSyncPlugin
	private propertyName: string
	private unsubscribeQueue: (() => void) | null = null
	private onStateChange: (state: "normal" | "queued" | "processing") => void

	constructor(
		plugin: GraphDBSyncPlugin,
		propertyName: string,
		onStateChange: (state: "normal" | "queued" | "processing") => void
	) {
		this.plugin = plugin
		this.propertyName = propertyName
		this.onStateChange = onStateChange

		// Subscribe to queue state changes
		this.unsubscribeQueue = StateService.subscribe("queue", () => {
			this.updateState()
		})

		// Initial state update
		this.updateState()
	}

	/**
	 * Handles sync button click
	 */
	async handleSync(): Promise<void> {
		const state = getPropertyRowState(this.plugin, this.propertyName)

		// Check if mapping is configured
		if (state.mappingType === "none") {
			new Notice("Please configure a mapping first")
			return
		}

		// Check if mapping is enabled
		if (!state.isEnabled) {
			new Notice("Please enable the mapping first")
			return
		}

		// Get password
		let password = CredentialService.getPassword()
		if (!password) {
			password = await PasswordPrompt.prompt(this.plugin)
			if (!password) {
				return
			}
		}

		// Determine sync type based on mapping type
		if (state.mappingType === "relationship") {
			// Queue relationship-sync
			SyncQueueService.addPropertySync(
				this.propertyName,
				"relationship-sync",
				this.plugin.settings
			)
		} else {
			// Queue property-sync (for node properties)
			SyncQueueService.addPropertySync(
				this.propertyName,
				"property-sync",
				this.plugin.settings
			)
		}
	}

	/**
	 * Updates sync button state based on queue
	 */
	private updateState(): void {
		const queueState = StateService.getQueueState()
		const state = getPropertyRowState(this.plugin, this.propertyName)

		// Determine sync type for this property
		const syncType: "property-sync" | "relationship-sync" =
			state.mappingType === "relationship" ? "relationship-sync" : "property-sync"

		// Get all enabled properties for this sync type
		const enabledProperties = syncType === "property-sync"
			? ConfigurationService.getEnabledNodePropertyMappings(this.plugin.settings).map(m => m.propertyName)
			: ConfigurationService.getEnabledRelationshipMappings(this.plugin.settings).map(m => m.propertyName)

		// Check if there's a full sync (contains all enabled properties)
		const isFullSync = (item: import("../../../types").SyncQueueItem): boolean => {
			if (item.type !== syncType || !item.properties) {
				return false
			}
			// Check if this item contains all enabled properties
			return enabledProperties.every(prop => item.properties!.has(prop))
		}

		// Check if this property is in a full sync
		const fullSyncInQueue = queueState.queue.find(isFullSync)

		// Check if this property is in the queue (specific or full sync)
		const isQueued = queueState.queue.some((item) => {
			if (item.type === syncType && item.properties) {
				return item.properties.has(this.propertyName) || isFullSync(item)
			}
			return false
		})

		// Check if this property is currently processing
		const isProcessing =
			queueState.current !== null &&
			queueState.current.type === syncType &&
			queueState.current.properties !== undefined &&
			(queueState.current.properties.has(this.propertyName) || isFullSync(queueState.current))

		if (isProcessing) {
			this.onStateChange("processing")
		} else if (isQueued || fullSyncInQueue) {
			this.onStateChange("queued")
		} else {
			this.onStateChange("normal")
		}
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.unsubscribeQueue) {
			this.unsubscribeQueue()
			this.unsubscribeQueue = null
		}
	}
}

