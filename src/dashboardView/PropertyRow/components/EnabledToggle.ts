import { Setting } from "obsidian"

/**
 * Enabled toggle component
 * Toggle for enabling/disabling a property mapping
 */
export class EnabledToggle {
	private container: HTMLElement
	private toggle: HTMLInputElement | null = null
	private onChange: (enabled: boolean) => Promise<void>

	constructor(
		container: HTMLElement,
		currentEnabled: boolean,
		onChange: (enabled: boolean) => Promise<void>
	) {
		this.container = container
		this.onChange = onChange
		this.render(currentEnabled)
	}

	private render(currentEnabled: boolean): void {
		const toggleContainer = this.container.createDiv("graphdb-property-config-toggle-container")
		const setting = new Setting(toggleContainer)
		
		setting.addToggle((toggle) => {
			this.toggle = toggle.toggleEl as HTMLInputElement
			toggle.setValue(currentEnabled)
			toggle.onChange(async (value) => {
				await this.onChange(value)
			})
		})
	}

	/**
	 * Gets the current enabled state
	 */
	getValue(): boolean {
		return this.toggle?.checked || false
	}

	/**
	 * Sets the enabled state
	 */
	setValue(enabled: boolean): void {
		if (this.toggle) {
			this.toggle.checked = enabled
		}
	}
}

