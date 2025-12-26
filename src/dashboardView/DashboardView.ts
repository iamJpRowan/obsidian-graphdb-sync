import { ItemView, WorkspaceLeaf, Modal, Notice, App } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { ConfigurationTabs } from "./ConfigurationTabs"
import { MigrationPanel } from "./MigrationPanel"
import { PropertyValidationService } from "../services/PropertyValidationService"
import { MigrationService } from "../services/MigrationService"
import { CredentialService } from "../services/CredentialService"
import { getVaultPath } from "../utils/obsidianApi"
import { DEFAULT_SETTINGS } from "../types"
import { PasswordPrompt } from "./components/PasswordPrompt"
import type { PropertyInfo, ValidationResult } from "../types"
import "./dashboardView.css"

export const DASHBOARD_VIEW_TYPE_V2 = "graphdb-sync-dashboard"

/**
 * New simplified dashboard view
 * Organized around 3 configuration types: Relationships, Node Properties, Labels
 */
export class DashboardViewV2 extends ItemView {
	plugin: GraphDBSyncPlugin
	private contentContainer: HTMLElement | null = null
	private migrationPanel: MigrationPanel | null = null
	private configurationTabs: ConfigurationTabs | null = null

	constructor(leaf: WorkspaceLeaf, plugin: GraphDBSyncPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE_V2
	}

	getDisplayText(): string {
		return "GraphDB Sync"
	}

	getIcon(): string {
		return "database"
	}

	async onOpen(): Promise<void> {
		this.render()
	}

	async onClose(): Promise<void> {
		// Cleanup
		if (this.migrationPanel) {
			this.migrationPanel.destroy()
		}
		if (this.configurationTabs) {
			this.configurationTabs.destroy()
		}
	}

	private render(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-dashboard-v2")

		// Main content container
		this.contentContainer = contentEl.createDiv("graphdb-dashboard-v2-content")

		// Migration Panel (settings cog is inside it)
		const migrationContainer = this.contentContainer.createDiv("graphdb-migration-panel-container")
		this.migrationPanel = new MigrationPanel(migrationContainer, this.plugin)

		// Configuration Tabs
		const configContainer = this.contentContainer.createDiv("graphdb-configuration-tabs-container")
		this.configurationTabs = new ConfigurationTabs(
			configContainer,
			this.plugin,
			{
				onConfigure: (property) => this.handleConfigure(property),
				onValidate: (property) => this.handleValidate(property),
				onMigrate: (property) => this.handleMigrate(property),
			}
		)
		}

	private async handleConfigure(property: PropertyInfo): Promise<void> {
		// TODO: Open configuration modal
		// For now, just show a notice
		new Notice(`Configure ${property.name} - Modal coming soon`)
		}

	private async handleValidate(property: PropertyInfo): Promise<void> {
		try {
			const result = await PropertyValidationService.validateProperty(
				this.plugin.app,
				property.name
			)

			// Show validation results in a modal
			const modal = new ValidationResultsModal(this.plugin.app, property, result)
			modal.open()
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			new Notice(`Validation failed: ${errorMessage}`)
	}
	}

	private async handleMigrate(property: PropertyInfo): Promise<void> {
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
			const result = await MigrationService.migrateProperty(
				property.name,
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

			if (result.success) {
				new Notice(`Property migration completed: ${property.name}`)
			} else {
				new Notice(`Property migration failed: ${result.message || "Unknown error"}`)
			}

			// Refresh tabs to show updated status
			if (this.configurationTabs) {
				this.configurationTabs.refresh()
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			new Notice(`Property migration failed: ${errorMessage}`)
		}
	}
}

/**
 * Modal for displaying validation results
 */
class ValidationResultsModal extends Modal {
	constructor(
		app: App,
		private property: PropertyInfo,
		private result: ValidationResult
	) {
		super(app)
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-validation-modal")

		contentEl.createEl("h2", {
			text: `Validation: ${this.property.name}`,
		})

		if (this.result.isValid) {
			contentEl.createDiv({
				text: "✓ No validation issues found",
				cls: "graphdb-validation-success",
			})
		} else {
			contentEl.createDiv({
				text: `⚠ ${this.result.issues.length} issue(s) found`,
				cls: "graphdb-validation-issues",
			})

			this.result.issues.forEach((issue) => {
				const issueEl = contentEl.createDiv("graphdb-validation-issue")
				issueEl.createDiv({
					text: `${issue.severity === "error" ? "✗" : "⚠"} ${issue.message}`,
				})
			})

			if (this.result.filesWithIssues.length > 0) {
				contentEl.createEl("h3", {
					text: "Files with Issues:",
				})
				const filesList = contentEl.createDiv("graphdb-validation-files")
				this.result.filesWithIssues.slice(0, 10).forEach((fileIssue) => {
					filesList.createDiv({
						text: fileIssue.filePath,
						cls: "graphdb-validation-file",
					})
				})
				if (this.result.filesWithIssues.length > 10) {
					filesList.createDiv({
						text: `... and ${this.result.filesWithIssues.length - 10} more`,
					})
			}
		}
	}
	}

	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
	}
}

