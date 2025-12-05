import type { App } from "obsidian"

/**
 * Opens the Obsidian settings tab
 * Uses type assertion to access internal Obsidian API
 * @param app - Obsidian app instance
 */
export function openSettings(app: App): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(app as any).setting.open()
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	;(app as any).setting.openTabById("graphdb-sync")
}

/**
 * Gets the vault base path from the adapter
 * Uses type assertion to access internal Obsidian API
 * @param app - Obsidian app instance
 * @returns Vault base path
 */
export function getVaultPath(app: App): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (app.vault.adapter as any).basePath
}


