import type GraphDBSyncPlugin from "../main"
import type { PropertyInfo } from "../types"
import { ConfigurationService } from "../services/ConfigurationService"

/**
 * Simple property row component
 * Shows property info, status, and action buttons
 */
export class PropertyRow {
	private plugin: GraphDBSyncPlugin
	private property: PropertyInfo
	private container: HTMLElement
	private rowEl: HTMLElement
	private onConfigure: (property: PropertyInfo) => void
	private onValidate: (property: PropertyInfo) => void
	private onMigrate: (property: PropertyInfo) => void

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		property: PropertyInfo,
		callbacks: {
			onConfigure: (property: PropertyInfo) => void
			onValidate: (property: PropertyInfo) => void
			onMigrate: (property: PropertyInfo) => void
		}
	) {
		this.container = container
		this.plugin = plugin
		this.property = property
		this.onConfigure = callbacks.onConfigure
		this.onValidate = callbacks.onValidate
		this.onMigrate = callbacks.onMigrate
		this.render()
	}

	private render(): void {
		// Check if enabled to add class
		const relMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)
		const nodeMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.property.name
		)
		const isEnabled = relMapping?.enabled || nodeMapping?.enabled || false
		const isMapped = !!relMapping || !!nodeMapping

		this.rowEl = this.container.createDiv("graphdb-property-row")
		if (isMapped) {
			this.rowEl.addClass("graphdb-property-row-mapped")
			if (isEnabled) {
				this.rowEl.addClass("graphdb-property-row-enabled")
			} else {
				this.rowEl.addClass("graphdb-property-row-disabled")
			}
		} else {
			this.rowEl.addClass("graphdb-property-row-unmapped")
		}

		// Property info section
		const infoSection = this.rowEl.createDiv("graphdb-property-row-info")
		
		// Property name
		const nameEl = infoSection.createDiv("graphdb-property-row-name")
		nameEl.setText(this.property.name)

		// Property details
		const detailsEl = infoSection.createDiv("graphdb-property-row-details")
		detailsEl.createSpan({
			text: `Type: ${this.property.type}${this.property.isArray ? "[]" : ""}`,
		})
		detailsEl.createSpan({
			text: `| Pattern: ${this.property.pattern}`,
		})
		detailsEl.createSpan({
			text: `| Found in: ${this.property.frequency} files`,
		})

		// Status section
		const statusSection = this.rowEl.createDiv("graphdb-property-row-status")
		this.renderStatus(statusSection)

		// Actions section
		const actionsSection = this.rowEl.createDiv("graphdb-property-row-actions")
		
		const configureBtn = actionsSection.createEl("button", {
			text: "Configure",
			cls: "mod-cta",
		})
		configureBtn.addEventListener("click", () => {
			this.onConfigure(this.property)
		})

		const validateBtn = actionsSection.createEl("button", {
			text: "Validate",
		})
		validateBtn.addEventListener("click", () => {
			this.onValidate(this.property)
		})

		const migrateBtn = actionsSection.createEl("button", {
			text: "Test",
		})
		migrateBtn.addEventListener("click", () => {
			this.onMigrate(this.property)
		})
	}

	private renderStatus(container: HTMLElement): void {
		container.empty()

		// Check for relationship mapping
		const relMapping = ConfigurationService.getRelationshipMapping(
			this.plugin.settings,
			this.property.name
		)

		// Check for node property mapping
		const nodeMapping = ConfigurationService.getNodePropertyMapping(
			this.plugin.settings,
			this.property.name
		)

		if (relMapping) {
			const statusEl = container.createSpan("graphdb-property-row-status-badge graphdb-property-row-status-mapped")
			statusEl.setText(`Relationship: ${relMapping.relationshipType} ${relMapping.direction === "outgoing" ? "→" : "←"}`)
			if (!relMapping.enabled) {
				statusEl.addClass("graphdb-property-row-status-disabled")
				statusEl.setText(statusEl.textContent + " (disabled)")
			} else {
				statusEl.addClass("graphdb-property-row-status-enabled")
			}
		} else if (nodeMapping) {
			const statusEl = container.createSpan("graphdb-property-row-status-badge graphdb-property-row-status-mapped")
			statusEl.setText("Node Property")
			if (!nodeMapping.enabled) {
				statusEl.addClass("graphdb-property-row-status-disabled")
				statusEl.setText(statusEl.textContent + " (disabled)")
			} else {
				statusEl.addClass("graphdb-property-row-status-enabled")
			}
		} else {
			const statusEl = container.createSpan("graphdb-property-row-status-badge graphdb-property-row-status-unmapped")
			statusEl.setText("Unmapped")
		}

		// Show wikilink indicator
		if (this.property.hasWikilinks) {
			const wikilinkBadge = container.createSpan("graphdb-property-row-status-badge graphdb-property-row-status-wikilink")
			wikilinkBadge.setText("Wikilinks")
		}
	}

	/**
	 * Updates the property data
	 */
	updateProperty(property: PropertyInfo): void {
		this.property = property
		// Re-render status in case mapping changed
		const statusSection = this.rowEl.querySelector(".graphdb-property-row-status")
		if (statusSection) {
			this.renderStatus(statusSection as HTMLElement)
		}
	}

	/**
	 * Gets the property name
	 */
	getPropertyName(): string {
		return this.property.name
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.rowEl.remove()
	}
}

