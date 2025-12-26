import { Notice } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { MigrationService } from "../services/MigrationService"
import { CredentialService } from "../services/CredentialService"
import { getVaultPath } from "../utils/obsidianApi"
import { DEFAULT_SETTINGS } from "../types"
import { PasswordPrompt } from "./components/PasswordPrompt"
import { SettingsLink } from "./components/SettingsLink"

/**
 * Migration panel component
 * Handles full migrations and displays migration status
 */
export class MigrationPanel {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private controlsContainer: HTMLElement | null = null
	private statusContainer: HTMLElement | null = null
	private settingsLink: SettingsLink | null = null

	constructor(container: HTMLElement, plugin: GraphDBSyncPlugin) {
		this.container = container
		this.plugin = plugin
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-migration-panel")

		// Header with settings cog
		const header = this.container.createDiv("graphdb-migration-panel-header")
		const settingsContainer = header.createDiv("graphdb-migration-panel-settings")
		this.settingsLink = new SettingsLink(settingsContainer, this.plugin)
		this.settingsLink.render()

		// Controls
		this.controlsContainer = this.container.createDiv("graphdb-migration-panel-controls")
		this.renderControls()

		// Status
		this.statusContainer = this.container.createDiv("graphdb-migration-panel-status")
		this.renderStatus()
	}

	private renderControls(): void {
		if (!this.controlsContainer) return

		this.controlsContainer.empty()

		// Full Migration section
		const fullSection = this.controlsContainer.createDiv("graphdb-migration-section")
		fullSection.createEl("h3", {
			text: "Full Migration",
		})

		const fullButtons = fullSection.createDiv("graphdb-migration-buttons")
		
		const replaceBtn = fullButtons.createEl("button", {
			text: "Full Migration (Replace All)",
			cls: "mod-cta",
		})
		replaceBtn.addEventListener("click", () => {
			this.startFullMigration("replace")
		})

		const updateBtn = fullButtons.createEl("button", {
			text: "Full Migration (Update Only)",
			cls: "mod-cta",
		})
		updateBtn.addEventListener("click", () => {
			this.startFullMigration("update")
		})
	}

	private renderStatus(): void {
		if (!this.statusContainer) return

		this.statusContainer.empty()

		const lastResult = this.plugin.settings.lastMigrationResult
		if (lastResult) {
			const statusEl = this.statusContainer.createDiv("graphdb-migration-status")
			statusEl.createDiv({
				text: lastResult.success
					? `✓ Last migration: ${lastResult.successCount}/${lastResult.totalFiles} files`
					: `✗ Last migration failed: ${lastResult.errorCount} errors`,
				cls: lastResult.success ? "graphdb-migration-status-success" : "graphdb-migration-status-error",
			})

			if (lastResult.timestamp) {
				const timeEl = statusEl.createDiv("graphdb-migration-status-time")
				const date = new Date(lastResult.timestamp)
				timeEl.setText(`Completed: ${date.toLocaleString()}`)
			}
		} else {
			this.statusContainer.createDiv({
				text: "No migrations run yet.",
				cls: "graphdb-migration-status-empty",
			})
		}
	}

	private async startFullMigration(strategy: "replace" | "update"): Promise<void> {
		if (MigrationService.isRunning()) {
			new Notice("Migration already in progress")
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

		const uri = this.plugin.settings.neo4jUri || DEFAULT_SETTINGS.neo4jUri
		const username = this.plugin.settings.neo4jUsername || DEFAULT_SETTINGS.neo4jUsername
		const vaultPath = getVaultPath(this.plugin.app)

		try {
			// TODO: Implement replace vs update strategy
			// For now, just use update (MERGE)
			const result = await MigrationService.migrate(
				vaultPath,
				uri,
				{ username, password },
				() => {
					// Progress updates
				},
				this.plugin.app,
				this.plugin.settings
			)

			// Save result
			this.plugin.settings.lastMigrationResult = {
				...result,
				timestamp: Date.now(),
			}
			await this.plugin.saveSettings()

			// Update display
			this.renderStatus()

			if (result.success) {
				new Notice(`Migration completed: ${result.successCount}/${result.totalFiles} files`)
			} else {
				new Notice(`Migration failed: ${result.message || "Unknown error"}`)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			new Notice(`Migration failed: ${errorMessage}`)
		}
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.settingsLink) {
			this.settingsLink.destroy()
		}
	}
}

