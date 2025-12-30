import { ItemView, WorkspaceLeaf, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { PropertiesTab } from "./PropertiesTab"
import { SyncPanel } from "./SyncPanel"
import { SettingsLink } from "./components/SettingsLink"
import "./styles.css"

export const DASHBOARD_VIEW_TYPE_V2 = "graphdb-sync-dashboard"

/**
 * Dashboard view
 * Shows all properties with filtering by frontmatter type and mapping type
 */
export class DashboardViewV2 extends ItemView {
	plugin: GraphDBSyncPlugin
	private contentContainer: HTMLElement | null = null
	private syncPanel: SyncPanel | null = null
	private propertiesTab: PropertiesTab | null = null
	private settingsLink: SettingsLink | null = null

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
		if (this.syncPanel) {
			this.syncPanel.destroy()
		}
		if (this.propertiesTab) {
			this.propertiesTab.destroy()
		}
		if (this.settingsLink) {
			this.settingsLink.destroy()
		}
	}

	private render(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-dashboard-v2")

		// Header row: database icon + title | settings cog
		const headerRow = contentEl.createDiv("graphdb-dashboard-header")
		const headerLeft = headerRow.createDiv("graphdb-dashboard-header-left")
		const iconEl = headerLeft.createSpan("graphdb-dashboard-header-icon")
		setIcon(iconEl, "database")
		const titleEl = headerLeft.createSpan("graphdb-dashboard-header-title")
		titleEl.setText("Graph DB Sync")
		const headerRight = headerRow.createDiv("graphdb-dashboard-header-right")
		this.settingsLink = new SettingsLink(headerRight, this.plugin)
		this.settingsLink.render()

		// Main content container
		this.contentContainer = contentEl.createDiv("graphdb-dashboard-v2-content")

		// Sync Panel
		const syncContainer = this.contentContainer.createDiv("graphdb-migration-panel-container")
		this.syncPanel = new SyncPanel(syncContainer, this.plugin)

		// Properties Tab (default view)
		const propertiesContainer = this.contentContainer.createDiv("graphdb-properties-container")
		this.propertiesTab = new PropertiesTab(
			propertiesContainer,
			this.plugin
		)
	}
}

