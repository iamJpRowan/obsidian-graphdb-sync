import type { MigrationProgress } from "./MigrationService"
import { CredentialService } from "./CredentialService"
import { Neo4jService } from "./Neo4jService"
import { DEFAULT_SETTINGS } from "../types"
import type { PluginSettings } from "../types"

/**
 * Connection state
 */
export interface ConnectionState {
	status: "unknown" | "testing" | "connected" | "error"
	error?: string
}

/**
 * Migration state
 */
export interface MigrationState {
	running: boolean
	paused: boolean
	cancelled: boolean
	progress: MigrationProgress | null
}

/**
 * Plugin state
 */
export interface PluginState {
	connection: ConnectionState
	migration: MigrationState
	isReady: boolean
}

/**
 * Event types for state changes
 */
export type StateEventType = "connection" | "migration" | "all"

/**
 * Callback for state change events
 */
export type StateChangeCallback = (state: PluginState) => void

/**
 * Central state management service with event-driven updates
 */
export class StateService {
	private static currentState: PluginState = {
		connection: { status: "unknown" },
		migration: {
			running: false,
			paused: false,
			cancelled: false,
			progress: null,
		},
		isReady: false,
	}

	private static subscribers: Map<StateEventType, Set<StateChangeCallback>> =
		new Map()

	private static connectionTestTimeout: ReturnType<typeof setTimeout> | null =
		null

	private static currentSettings: PluginSettings | null = null

	/**
	 * Initializes the state service
	 * @param settings - Plugin settings
	 */
	static initialize(settings: PluginSettings): void {
		this.currentSettings = settings
		// Initialize connection state (defaults to error since password will be cleared)
		this.currentState.connection = { status: "error" }
		this.updateIsReady()
		this.emit("all")
	}

	/**
	 * Updates the settings reference
	 * @param settings - Plugin settings
	 */
	static updateSettings(settings: PluginSettings): void {
		this.currentSettings = settings
		this.updateIsReady()
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
	 * Updates connection state
	 */
	static setConnectionState(state: ConnectionState): void {
		this.currentState.connection = state
		this.emit("connection")
		this.emit("all")
	}

	/**
	 * Updates migration state
	 */
	static setMigrationState(state: Partial<MigrationState>): void {
		this.currentState.migration = {
			...this.currentState.migration,
			...state,
		}
		this.updateIsReady() // Update isReady before emitting
		this.emit("migration")
		this.emit("all")
	}

	/**
	 * Tests connection and updates state
	 * Uses debouncing to avoid excessive connection tests
	 * @param immediate - If true, bypasses debounce and tests immediately
	 */
	static async testConnection(
		settings: PluginSettings,
		debounceMs: number = 500,
		immediate: boolean = false
	): Promise<void> {
		const uri = settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username = settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		const password = CredentialService.getPassword()

		// If no password, set error state immediately
		if (!password) {
			this.setConnectionState({
				status: "error",
				error: "Password required",
			})
			this.updateIsReady()
			this.emit("all") // Emit after isReady update
			return
		}

		// If immediate, test right away without debouncing
		if (immediate) {
			// Clear any pending debounced test
			if (this.connectionTestTimeout) {
				clearTimeout(this.connectionTestTimeout)
				this.connectionTestTimeout = null
			}

			// Set testing state
			this.setConnectionState({ status: "testing" })

			try {
				await Neo4jService.testConnection(uri, {
					username: username,
					password: password,
				})
				this.setConnectionState({ status: "connected" })
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error)
				this.setConnectionState({
					status: "error",
					error: errorMessage,
				})
			}

			this.updateIsReady()
			this.emit("all") // Emit after isReady update
			return
		}

		// Clear existing timeout
		if (this.connectionTestTimeout) {
			clearTimeout(this.connectionTestTimeout)
			this.connectionTestTimeout = null
		}

		// Set up debounced connection test
		this.connectionTestTimeout = setTimeout(async () => {
			this.connectionTestTimeout = null

			// Set testing state
			this.setConnectionState({ status: "testing" })

			try {
				await Neo4jService.testConnection(uri, {
					username: username,
					password: password,
				})
				this.setConnectionState({ status: "connected" })
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error)
				this.setConnectionState({
					status: "error",
					error: errorMessage,
				})
			}

			this.updateIsReady()
			this.emit("all") // Emit after isReady update
		}, debounceMs)
	}

	/**
	 * Updates isReady based on current state
	 */
	private static updateIsReady(): void {
		if (!this.currentSettings) {
			this.currentState.isReady = false
			return
		}

		const hasPassword = CredentialService.hasPassword()
		const hasUri = Boolean(
			this.currentSettings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		)
		const hasUsername = Boolean(
			this.currentSettings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		)
		const connectionOk = this.currentState.connection.status === "connected"
		const migrationNotRunning = !this.currentState.migration.running

		this.currentState.isReady =
			hasPassword && hasUri && hasUsername && connectionOk && migrationNotRunning
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
}

