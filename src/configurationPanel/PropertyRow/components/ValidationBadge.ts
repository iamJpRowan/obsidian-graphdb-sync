import { setIcon } from "obsidian"

/**
 * Validation badge component
 * Displays validation status with icon and/or text
 */
export class ValidationBadge {
	private container: HTMLElement
	private badgeEl: HTMLElement | null = null
	private iconEl: HTMLElement | null = null
	private textEl: HTMLElement | null = null

	constructor(container: HTMLElement) {
		this.container = container
	}

	/**
	 * Renders the badge in "validating" state
	 */
	renderValidating(): void {
		this.clear()
		this.badgeEl = this.container.createSpan("graphdb-validation-badge")
		this.badgeEl.setAttr("aria-label", "Validating...")
		this.iconEl = this.badgeEl.createSpan("graphdb-validation-badge-icon graphdb-validation-badge-icon-spinning")
		setIcon(this.iconEl, "sync")
	}

	/**
	 * Renders the badge in "has issues" state
	 */
	renderHasIssues(issueCount: number, onClick: () => void, onRightClick: () => void): void {
		this.clear()
		this.badgeEl = this.container.createSpan("graphdb-validation-badge graphdb-validation-badge-warning")
		this.badgeEl.setAttr("aria-label", "Show Issues")
		this.badgeEl.setAttr("role", "button")
		this.badgeEl.setAttr("tabindex", "0")
		this.iconEl = this.badgeEl.createSpan("graphdb-validation-badge-icon")
		setIcon(this.iconEl, "alert-triangle")
		this.textEl = this.badgeEl.createSpan("graphdb-validation-badge-text")
		this.textEl.setText(`${issueCount}`)
		this.badgeEl.addEventListener("click", onClick)
		this.badgeEl.addEventListener("contextmenu", (e) => {
			e.preventDefault()
			onRightClick()
		})
		this.badgeEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				onClick()
			}
		})
	}

	/**
	 * Renders the badge in "no issues" state
	 */
	renderNoIssues(onClick: () => void): void {
		this.clear()
		this.badgeEl = this.container.createSpan("graphdb-validation-badge graphdb-validation-badge-success")
		this.badgeEl.setAttr("aria-label", "No Validation Issues. Click to run again")
		this.badgeEl.setAttr("role", "button")
		this.badgeEl.setAttr("tabindex", "0")
		this.iconEl = this.badgeEl.createSpan("graphdb-validation-badge-icon")
		setIcon(this.iconEl, "check")
		this.badgeEl.addEventListener("click", onClick)
		this.badgeEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault()
				onClick()
			}
		})
	}

	/**
	 * Clears the badge
	 */
	private clear(): void {
		if (this.badgeEl) {
			this.badgeEl.remove()
		}
		this.badgeEl = null
		this.iconEl = null
		this.textEl = null
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.clear()
	}
}

