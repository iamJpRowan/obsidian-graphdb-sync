import type { SyncProgress } from "./SyncService/types"
import type { PluginSettings, SyncQueueState } from "../types"

/**
 * Migration state
 */
export interface MigrationState {
	running: boolean
	paused: boolean
	cancelled: boolean
	progress: SyncProgress | null
}

/**
 * Plugin state
 */
export interface PluginState {
	migration: MigrationState
	queue: SyncQueueState
}

/**
 * Event types for state changes
 */
export type StateEventType = "migration" | "queue" | "all"

/**
 * Callback for state change events
 */
export type StateChangeCallback = (state: PluginState) => void

/**
 * Central state management service with event-driven updates
 */
export class StateService {
	private static currentState: PluginState = {
		migration: {
			running: false,
			paused: false,
			cancelled: false,
			progress: null,
		},
		queue: {
			queue: [],
			current: null,
		},
	}

	private static subscribers: Map<StateEventType, Set<StateChangeCallback>> =
		new Map()

	private static currentSettings: PluginSettings | null = null

	/**
	 * Initializes the state service
	 * @param settings - Plugin settings
	 */
	static initialize(settings: PluginSettings): void {
		this.currentSettings = settings
		this.emit("all")
	}

	/**
	 * Updates the settings reference
	 * @param settings - Plugin settings
	 */
	static updateSettings(settings: PluginSettings): void {
		this.currentSettings = settings
	}

	/**
	 * Subscribes to state changes
	 * @param eventType - Type of event to listen for
	 * @param callback - Callback function
	 * @returns Unsubscribe function
	 */
	static subscribe(
		eventType: StateEventType,
		callback: StateChangeCallback
	): () => void {
		if (!this.subscribers.has(eventType)) {
			this.subscribers.set(eventType, new Set())
		}
		this.subscribers.get(eventType)!.add(callback)

		// Immediately call with current state
		callback(this.currentState)

		// Return unsubscribe function
		return () => {
			this.subscribers.get(eventType)?.delete(callback)
		}
	}

	/**
	 * Gets the current state
	 */
	static getState(): PluginState {
		return { ...this.currentState }
	}

	/**
	 * Updates migration state
	 */
	static setMigrationState(state: Partial<MigrationState>): void {
		this.currentState.migration = {
			...this.currentState.migration,
			...state,
		}
		this.emit("migration")
		this.emit("all")
	}

	/**
	 * Emits state change events to subscribers
	 */
	private static emit(eventType: StateEventType): void {
		const callbacks = this.subscribers.get(eventType)
		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback(this.currentState)
				} catch (error) {
					console.error("Error in state change callback:", error)
				}
			})
		}

		// Also emit to "all" subscribers if not already emitting to all
		if (eventType !== "all") {
			const allCallbacks = this.subscribers.get("all")
			if (allCallbacks) {
				allCallbacks.forEach((callback) => {
					try {
						callback(this.currentState)
					} catch (error) {
						console.error("Error in state change callback:", error)
					}
				})
			}
		}
	}

	/**
	 * Gets migration status
	 */
	static getMigrationStatus(): MigrationState {
		return { ...this.currentState.migration }
	}

	/**
	 * Checks if migration can be started
	 * Only checks if migration is already running (the only real blocker)
	 */
	static canStartMigration(): boolean {
		return !this.currentState.migration.running
	}

	/**
	 * Updates queue state
	 */
	static setQueueState(state: Partial<SyncQueueState>): void {
		this.currentState.queue = {
			...this.currentState.queue,
			...state,
		}
		this.emit("queue")
		this.emit("all")
	}

	/**
	 * Gets queue state
	 */
	static getQueueState(): SyncQueueState {
		return { ...this.currentState.queue }
	}
}

