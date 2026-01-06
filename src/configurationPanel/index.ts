import { ItemView, WorkspaceLeaf, setIcon } from "obsidian"
import type GraphDBSyncPlugin from "../main"
import { PropertiesTab } from "./PropertiesTab"
import { SettingsTab } from "./SettingsTab"
import { SyncPanel } from "./SyncPanel"
import "./styles.css"

export const CONFIGURATION_PANEL_VIEW_TYPE = "graphdb-sync-configuration-panel"

/**
 * Configuration panel view
 * Shows sync panel, properties tab, and settings tab
 */
type TabId = "properties" | "settings" | "labels"

interface TabConfig {
	id: TabId
	label: string
	icon: string
}

export class ConfigurationPanel extends ItemView {
	plugin: GraphDBSyncPlugin
	private contentContainer: HTMLElement | null = null
	private syncPanel: SyncPanel | null = null
	private propertiesTab: PropertiesTab | null = null
	private settingsTab: SettingsTab | null = null
	private labelsTab: import("./LabelsTab/index").LabelsTab | null = null
	private tabContainer: HTMLElement | null = null
	private tabContentContainer: HTMLElement | null = null
	private activeTab: TabId = "properties"

	private readonly tabs: TabConfig[] = [
		{ id: "properties", label: "Properties", icon: "table-properties" },
		{ id: "labels", label: "Labels", icon: "tags" },
		{ id: "settings", label: "Settings", icon: "settings" },
	]

	constructor(leaf: WorkspaceLeaf, plugin: GraphDBSyncPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return CONFIGURATION_PANEL_VIEW_TYPE
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
		if (this.settingsTab) {
			this.settingsTab.destroy()
		}
		if (this.labelsTab) {
			this.labelsTab.destroy()
		}
	}

	private render(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-configuration-panel")

		// Header row: database icon + title
		const headerRow = contentEl.createDiv("graphdb-configuration-panel-header")
		const headerLeft = headerRow.createDiv("graphdb-configuration-panel-header-left")
		const iconEl = headerLeft.createSpan("graphdb-configuration-panel-header-icon")
		setIcon(iconEl, "database")
		const titleEl = headerLeft.createSpan("graphdb-configuration-panel-header-title")
		titleEl.setText("Graph DB Sync")

		// Main content container
		this.contentContainer = contentEl.createDiv("graphdb-configuration-panel-content")

		// Sync Panel
		const syncContainer = this.contentContainer.createDiv("graphdb-migration-panel-container")
		this.syncPanel = new SyncPanel(syncContainer, this.plugin)

		// Tab navigation
		this.tabContainer = this.contentContainer.createDiv("graphdb-configuration-panel-tabs")
		this.renderTabs()

		// Tab content container
		this.tabContentContainer = this.contentContainer.createDiv("graphdb-configuration-panel-tab-content")
		this.renderActiveTab().catch(console.error)
	}

	private renderTabs(): void {
		if (!this.tabContainer) return

		this.tabContainer.empty()
		this.tabContainer.addClass("graphdb-configuration-panel-tabs-container")

		// Render each tab
		this.tabs.forEach((tabConfig) => {
			const tab = this.tabContainer!.createDiv("graphdb-configuration-panel-tab")
			if (this.activeTab === tabConfig.id) {
				tab.addClass("is-active")
			}
			const icon = tab.createSpan("graphdb-configuration-panel-tab-icon")
			setIcon(icon, tabConfig.icon)
			const text = tab.createSpan("graphdb-configuration-panel-tab-text")
			text.setText(tabConfig.label)
			tab.addEventListener("click", () => {
				this.switchTab(tabConfig.id)
			})
		})
	}

	private switchTab(tab: TabId): void {
		if (this.activeTab === tab) return

		this.activeTab = tab
		this.renderTabs()
		this.renderActiveTab().catch(console.error)
	}

	private async renderActiveTab(): Promise<void> {
		if (!this.tabContentContainer) return

		this.tabContentContainer.empty()

		// Destroy all tabs (only one will be active)
		this.destroyTab("properties")
		this.destroyTab("labels")
		this.destroyTab("settings")

		// Create and render active tab
		if (this.activeTab === "properties") {
			const propertiesContainer = this.tabContentContainer.createDiv("graphdb-properties-container")
			this.propertiesTab = new PropertiesTab(
				propertiesContainer,
				this.plugin
			)
		} else if (this.activeTab === "labels") {
			const labelsContainer = this.tabContentContainer.createDiv("graphdb-labels-container")
			const { LabelsTab } = await import("./LabelsTab/index")
			this.labelsTab = new LabelsTab(
				labelsContainer,
				this.plugin
			)
		} else if (this.activeTab === "settings") {
			const settingsContainer = this.tabContentContainer.createDiv("graphdb-settings-container")
			this.settingsTab = new SettingsTab(
				settingsContainer,
				this.plugin
			)
		}
	}

	/**
	 * Destroys the specified tab component
	 */
	private destroyTab(tab: TabId): void {
		if (tab === "properties" && this.propertiesTab) {
			this.propertiesTab.destroy()
			this.propertiesTab = null
		} else if (tab === "labels" && this.labelsTab) {
			this.labelsTab.destroy()
			this.labelsTab = null
		} else if (tab === "settings" && this.settingsTab) {
			this.settingsTab.destroy()
			this.settingsTab = null
		}
	}
}

