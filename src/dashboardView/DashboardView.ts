import { ItemView, WorkspaceLeaf } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { PropertiesTab } from "./PropertiesTab"
import { MigrationPanel } from "./MigrationPanel"
import "./styles.css"

export const DASHBOARD_VIEW_TYPE_V2 = "graphdb-sync-dashboard"

/**
 * Dashboard view
 * Shows all properties with filtering by frontmatter type and mapping type
 */
export class DashboardViewV2 extends ItemView {
	plugin: GraphDBSyncPlugin
	private contentContainer: HTMLElement | null = null
	private migrationPanel: MigrationPanel | null = null
	private propertiesTab: PropertiesTab | null = null

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
		if (this.propertiesTab) {
			this.propertiesTab.destroy()
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

		// Properties Tab (default view)
		const propertiesContainer = this.contentContainer.createDiv("graphdb-properties-container")
		this.propertiesTab = new PropertiesTab(
			propertiesContainer,
			this.plugin
		)
	}
}

