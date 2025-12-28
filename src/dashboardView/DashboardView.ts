import { ItemView, WorkspaceLeaf, Notice } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { ConfigurationTabs } from "./ConfigurationTabs"
import { MigrationPanel } from "./MigrationPanel"
import type { PropertyInfo } from "../types"
import "./styles.css"

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
			}
		)
	}

	private async handleConfigure(property: PropertyInfo): Promise<void> {
		// TODO: Open configuration modal
		// For now, just show a notice
		new Notice(`Configure ${property.name} - Modal coming soon`)
		}
}

