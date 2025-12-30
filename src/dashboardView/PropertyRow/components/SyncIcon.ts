import { setIcon } from "obsidian"

/**
 * Sync icon component
 * Clickable icon with text that shows sync state
 */
export class SyncIcon {
	private container: HTMLElement
	private iconEl: HTMLElement | null = null
	private textEl: HTMLElement | null = null
	private onClick: () => void

	constructor(container: HTMLElement, onClick: () => void) {
		this.container = container
		this.onClick = onClick
	}

	/**
	 * Renders the sync icon in normal state
	 * @param disabled - Whether the icon should be disabled (e.g., mapping not enabled)
	 */
	renderNormal(disabled: boolean = false): void {
		this.clear()
		const syncContainer = this.container.createDiv(
			`graphdb-sync-icon-container${disabled ? " graphdb-sync-icon-disabled" : ""}`
		)
		syncContainer.setAttr("role", "button")
		syncContainer.setAttr("tabindex", disabled ? "-1" : "0")
		syncContainer.setAttr("aria-label", disabled ? "Enable mapping to sync" : "Sync property")
		if (disabled) {
			syncContainer.setAttr("aria-disabled", "true")
		}
		this.iconEl = syncContainer.createSpan("graphdb-sync-icon")
		setIcon(this.iconEl, "database-backup")
		this.textEl = syncContainer.createSpan("graphdb-sync-icon-text")
		this.textEl.setText("Sync")
		if (!disabled) {
			syncContainer.addEventListener("click", this.onClick)
			syncContainer.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					this.onClick()
				}
			})
		}
	}

	/**
	 * Renders the sync icon in queued state
	 */
	renderQueued(): void {
		this.clear()
		const syncContainer = this.container.createDiv(
			"graphdb-sync-icon-container graphdb-sync-icon-queued"
		)
		syncContainer.setAttr("role", "button")
		syncContainer.setAttr("tabindex", "0")
		syncContainer.setAttr("aria-label", "Queued for sync")
		this.iconEl = syncContainer.createSpan("graphdb-sync-icon")
		setIcon(this.iconEl, "clock")
		this.textEl = syncContainer.createSpan("graphdb-sync-icon-text")
		this.textEl.setText("Queued")
	}

	/**
	 * Renders the sync icon in processing state
	 */
	renderProcessing(): void {
		this.clear()
		const syncContainer = this.container.createDiv(
			"graphdb-sync-icon-container graphdb-sync-icon-processing"
		)
		syncContainer.setAttr("role", "button")
		syncContainer.setAttr("tabindex", "0")
		syncContainer.setAttr("aria-label", "Syncing...")
		this.iconEl = syncContainer.createSpan(
			"graphdb-sync-icon graphdb-sync-icon-spinning"
		)
		setIcon(this.iconEl, "sync")
		this.textEl = syncContainer.createSpan("graphdb-sync-icon-text")
		this.textEl.setText("Syncing...")
	}

	/**
	 * Clears the container
	 */
	private clear(): void {
		this.container.empty()
		this.iconEl = null
		this.textEl = null
	}
}

