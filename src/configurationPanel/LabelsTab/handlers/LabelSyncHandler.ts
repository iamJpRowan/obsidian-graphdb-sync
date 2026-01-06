import type GraphDBSyncPlugin from "../../../main"
import { SyncQueueService } from "../../../services/SyncQueueService"
import { StateService } from "../../../services/StateService"
import { ConfigurationService } from "../../../services/ConfigurationService"
import { CredentialService } from "../../../services/CredentialService"
import { PasswordPrompt } from "../../components/PasswordPrompt"

/**
 * Sync handler component for label rows
 * Handles sync button clicks and queue state for label rules
 */
export class LabelSyncHandler {
	private plugin: GraphDBSyncPlugin
	private ruleId: string
	private unsubscribeQueue: (() => void) | null = null
	private onStateChange: (state: "normal" | "queued" | "processing") => void

	constructor(
		plugin: GraphDBSyncPlugin,
		ruleId: string,
		onStateChange: (state: "normal" | "queued" | "processing") => void
	) {
		this.plugin = plugin
		this.ruleId = ruleId
		this.onStateChange = onStateChange

		// Subscribe to queue state changes
		this.unsubscribeQueue = StateService.subscribe("queue", () => {
			this.updateState()
		})

		// Initial state update
		this.updateState()
	}

	/**
	 * Gets the current label name for this rule
	 */
	private getLabelName(): string {
		const rule = ConfigurationService.getLabelRule(
			this.plugin.settings,
			this.ruleId
		)
		return rule?.labelName || ""
	}

	/**
	 * Handles sync button click
	 */
	async handleSync(): Promise<void> {
		// Get password
		let password = CredentialService.getPassword()
		if (!password) {
			password = await PasswordPrompt.prompt(this.plugin)
			if (!password) {
				return
			}
		}

		// Get current label name (may have changed if renamed)
		const labelName = this.getLabelName()
		if (!labelName) {
			return
		}

		// Queue label-sync
		SyncQueueService.addLabelSync(labelName, this.plugin.settings)
	}

	/**
	 * Updates sync button state based on queue
	 */
	private updateState(): void {
		const queueState = StateService.getQueueState()

		// Get current label name (may have changed if renamed)
		const labelName = this.getLabelName()
		if (!labelName) {
			this.onStateChange("normal")
			return
		}

		// Get all label names for full sync check
		const allLabelNames = ConfigurationService.getLabelRules(
			this.plugin.settings
		).map((r) => r.labelName)

		// Check if there's a full sync (contains all labels)
		const isFullSync = (
			item: import("../../../types").SyncItem
		): boolean => {
			if (item.type !== "label-sync") {
				return false
			}
			// Check if this item contains all labels
			const labelsSet =
				item.properties instanceof Set
					? item.properties
					: new Set(item.properties)
			return allLabelNames.every((label) => labelsSet.has(label))
		}

		// Check if this label is in a full sync
		const fullSyncInQueue = queueState.queue.find(isFullSync)

		// Check if this label is in the queue (specific or full sync)
		const isQueued = queueState.queue.some((item) => {
			if (item.type === "label-sync") {
				const labelsSet =
					item.properties instanceof Set
						? item.properties
						: new Set(item.properties)
				return labelsSet.has(labelName) || isFullSync(item)
			}
			return false
		})

		// Check if this label is currently processing
		const isProcessing =
			queueState.current !== null &&
			queueState.current.type === "label-sync" &&
			(() => {
				const labelsSet =
					queueState.current!.properties instanceof Set
						? queueState.current!.properties
						: new Set(queueState.current!.properties)
				return (
					labelsSet.has(labelName) || isFullSync(queueState.current!)
				)
			})()

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

