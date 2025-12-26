import type GraphDBSyncPlugin from "../main"
import { RelationshipMappingsTab } from "./RelationshipMappingsTab"
import { NodePropertyMappingsTab } from "./NodePropertyMappingsTab"
import { LabelRulesTab } from "./LabelRulesTab"
import type { PropertyInfo } from "../types"

/**
 * Configuration tabs component
 * Manages the 3-tab interface for configuring relationships, node properties, and labels
 */
export class ConfigurationTabs {
	private plugin: GraphDBSyncPlugin
	private container: HTMLElement
	private tabButtons: HTMLElement | null = null
	private tabContent: HTMLElement | null = null
	private activeTab: "relationships" | "nodeProperties" | "labels" = "relationships"
	private relationshipTab: RelationshipMappingsTab | null = null
	private nodePropertyTab: NodePropertyMappingsTab | null = null
	private labelTab: LabelRulesTab | null = null
	private onConfigure: (property: PropertyInfo) => void
	private onValidate: (property: PropertyInfo) => void
	private onMigrate: (property: PropertyInfo) => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
			onValidate: (property: PropertyInfo) => void
			onMigrate: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.onConfigure = callbacks.onConfigure
		this.onValidate = callbacks.onValidate
		this.onMigrate = callbacks.onMigrate
		this.render()
	}

	private render(): void {
		this.container.empty()
		this.container.addClass("graphdb-configuration-tabs")

		// Tab buttons
		this.tabButtons = this.container.createDiv("graphdb-tab-buttons")
		
		const relationshipsBtn = this.tabButtons.createEl("button", {
			text: "Relationships",
			cls: "graphdb-tab-button graphdb-tab-button-active",
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
		this.switchTab("relationships")
	}

	private switchTab(tab: "relationships" | "nodeProperties" | "labels"): void {
		this.activeTab = tab

		// Update button states
		if (this.tabButtons) {
			const buttons = this.tabButtons.querySelectorAll(".graphdb-tab-button")
			buttons.forEach((btn, index) => {
				btn.removeClass("graphdb-tab-button-active")
				if (
					(tab === "relationships" && index === 0) ||
					(tab === "nodeProperties" && index === 1) ||
					(tab === "labels" && index === 2)
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
			if (tab === "relationships") {
				this.relationshipTab = new RelationshipMappingsTab(
					this.tabContent,
					this.plugin,
					{
						onConfigure: this.onConfigure,
						onValidate: this.onValidate,
						onMigrate: this.onMigrate,
					}
				)
			} else if (tab === "nodeProperties") {
				this.nodePropertyTab = new NodePropertyMappingsTab(
					this.tabContent,
					this.plugin,
					{
						onConfigure: this.onConfigure,
						onValidate: this.onValidate,
						onMigrate: this.onMigrate,
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
		if (this.activeTab === "relationships" && this.relationshipTab) {
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

