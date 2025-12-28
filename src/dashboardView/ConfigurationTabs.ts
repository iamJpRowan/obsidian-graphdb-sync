import type GraphDBSyncPlugin from "../main"
import { PropertiesTab } from "./PropertiesTab"
import { RelationshipMappingsTab } from "./RelationshipMappingsTab"
import { NodePropertyMappingsTab } from "./NodePropertyMappingsTab"
import { LabelRulesTab } from "./LabelRulesTab"
import type { PropertyInfo } from "../types"

/**
 * Configuration tabs component
 * Manages the 4-tab interface: Properties, Relationships, Node Properties, and Labels
 */
export class ConfigurationTabs {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private tabButtons: HTMLElement | null = null
	private tabContent: HTMLElement | null = null
	private activeTab: "properties" | "relationships" | "nodeProperties" | "labels" = "properties"
	private propertiesTab: PropertiesTab | null = null
	private relationshipTab: RelationshipMappingsTab | null = null
	private nodePropertyTab: NodePropertyMappingsTab | null = null
	private labelTab: LabelRulesTab | null = null
	private onConfigure: (property: PropertyInfo) => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.onConfigure = callbacks.onConfigure
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-configuration-tabs")

		// Tab buttons
		this.tabButtons = this.container.createDiv("graphdb-tab-buttons")
		
		const propertiesBtn = this.tabButtons.createEl("button", {
			text: "All Properties",
			cls: "graphdb-tab-button graphdb-tab-button-active",
		})
		propertiesBtn.addEventListener("click", () => {
			this.switchTab("properties")
		})

		const relationshipsBtn = this.tabButtons.createEl("button", {
			text: "Relationships",
			cls: "graphdb-tab-button",
		})
		relationshipsBtn.addEventListener("click", () => {
			this.switchTab("relationships")
		})

		const nodePropertiesBtn = this.tabButtons.createEl("button", {
			text: "Node Properties",
			cls: "graphdb-tab-button",
		})
		nodePropertiesBtn.addEventListener("click", () => {
			this.switchTab("nodeProperties")
		})

		const labelsBtn = this.tabButtons.createEl("button", {
			text: "Labels",
			cls: "graphdb-tab-button",
		})
		labelsBtn.addEventListener("click", () => {
			this.switchTab("labels")
		})

		// Tab content
		this.tabContent = this.container.createDiv("graphdb-tab-content")

		// Render initial tab
		this.switchTab("properties")
	}

	private switchTab(tab: "properties" | "relationships" | "nodeProperties" | "labels"): void {
		this.activeTab = tab

		// Update button states
		if (this.tabButtons) {
			const buttons = this.tabButtons.querySelectorAll(".graphdb-tab-button")
			buttons.forEach((btn, index) => {
				btn.removeClass("graphdb-tab-button-active")
				if (
					(tab === "properties" && index === 0) ||
					(tab === "relationships" && index === 1) ||
					(tab === "nodeProperties" && index === 2) ||
					(tab === "labels" && index === 3)
				) {
					btn.addClass("graphdb-tab-button-active")
				}
			})
		}

		// Clear content
		if (this.tabContent) {
			this.tabContent.empty()
		}

		// Destroy existing tabs
		if (this.propertiesTab) {
			this.propertiesTab.destroy()
			this.propertiesTab = null
		}
		if (this.relationshipTab) {
			this.relationshipTab.destroy()
			this.relationshipTab = null
		}
		if (this.nodePropertyTab) {
			this.nodePropertyTab.destroy()
			this.nodePropertyTab = null
		}
		if (this.labelTab) {
			this.labelTab.destroy()
			this.labelTab = null
		}

		// Render new tab
		if (this.tabContent) {
			if (tab === "properties") {
				this.propertiesTab = new PropertiesTab(
					this.tabContent,
					this.plugin,
					{
						onConfigure: this.onConfigure,
					}
				)
			} else if (tab === "relationships") {
				this.relationshipTab = new RelationshipMappingsTab(
					this.tabContent,
					this.plugin,
					{
						onConfigure: this.onConfigure,
					}
				)
			} else if (tab === "nodeProperties") {
				this.nodePropertyTab = new NodePropertyMappingsTab(
					this.tabContent,
					this.plugin,
					{
						onConfigure: this.onConfigure,
					}
				)
			} else if (tab === "labels") {
				this.labelTab = new LabelRulesTab(this.tabContent, this.plugin)
			}
		}
	}

	/**
	 * Refreshes the active tab
	 */
	refresh(): void {
		if (this.activeTab === "properties" && this.propertiesTab) {
			this.propertiesTab.refresh()
		} else if (this.activeTab === "relationships" && this.relationshipTab) {
			this.relationshipTab.refresh()
		} else if (this.activeTab === "nodeProperties" && this.nodePropertyTab) {
			this.nodePropertyTab.refresh()
		}
		// Labels tab doesn't need refresh (no properties to reload)
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		if (this.propertiesTab) {
			this.propertiesTab.destroy()
		}
		if (this.relationshipTab) {
			this.relationshipTab.destroy()
		}
		if (this.nodePropertyTab) {
			this.nodePropertyTab.destroy()
		}
		if (this.labelTab) {
			this.labelTab.destroy()
		}
	}
}

