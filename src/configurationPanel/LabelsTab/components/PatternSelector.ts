import type GraphDBSyncPlugin from "../../../main"
import {
	getAvailableTags,
	getAvailableFolders,
	getCurrentRulePattern,
} from "../utils/patternOptions"

/**
 * Pattern selector component
 * Handles rendering and management of pattern dropdown (tags/folders)
 */
export class PatternSelector {
	private plugin: GraphDBSyncPlugin
	private ruleId: string
	private select: HTMLSelectElement
	private container: HTMLElement

	constructor(
		container: HTMLElement,
		plugin: GraphDBSyncPlugin,
		ruleId: string
	) {
		this.container = container
		this.plugin = plugin
		this.ruleId = ruleId
		this.select = container.createEl("select", {
			cls: "graphdb-property-config-select",
		})
	}

	/**
	 * Gets the current selected pattern value
	 */
	getValue(): string {
		return this.select.value
	}

	/**
	 * Sets the pattern value
	 */
	setValue(value: string): void {
		this.select.value = value
	}

	/**
	 * Updates the pattern options based on rule type
	 * @param ruleType - Rule type ("tag" or "path")
	 * @param currentValue - Current pattern value to preserve
	 */
	updateOptions(ruleType: "tag" | "path", currentValue?: string): void {
		const valueToPreserve = currentValue || this.select.value
		this.select.empty()

		if (ruleType === "tag") {
			this.populateTagOptions(valueToPreserve)
		} else {
			this.populateFolderOptions(valueToPreserve)
		}
	}

	/**
	 * Populates tag options
	 */
	private populateTagOptions(currentValue: string): void {
		const availableTags = getAvailableTags(
			this.plugin.app,
			this.plugin.settings,
			this.ruleId
		)

		// Get all tags for empty state check
		const allTags = availableTags.length > 0
			? availableTags
			: this.getAllTags()

		if (availableTags.length === 0 && allTags.length === 0) {
			const option = this.select.createEl("option", {
				text: "No tags found",
				value: "",
			})
			option.disabled = true
		} else if (availableTags.length === 0) {
			const option = this.select.createEl("option", {
				text: "All tags are already in use",
				value: "",
			})
			option.disabled = true
		} else {
			this.select.createEl("option", {
				text: "Select a tag...",
				value: "",
			})
			availableTags.forEach((tag) => {
				this.select.createEl("option", { text: tag, value: tag })
			})
		}

		this.preserveCurrentValue(currentValue, "tag")
	}

	/**
	 * Populates folder options
	 */
	private populateFolderOptions(currentValue: string): void {
		const availableFolders = getAvailableFolders(
			this.plugin.app,
			this.plugin.settings,
			this.ruleId
		)

		// Get all folders for empty state check
		const allFolders = availableFolders.length > 0
			? availableFolders
			: this.getAllFolders()

		if (availableFolders.length === 0 && allFolders.length === 0) {
			const option = this.select.createEl("option", {
				text: "No folders found",
				value: "",
			})
			option.disabled = true
		} else if (availableFolders.length === 0) {
			const option = this.select.createEl("option", {
				text: "All folders are already in use",
				value: "",
			})
			option.disabled = true
		} else {
			this.select.createEl("option", {
				text: "Select a folder...",
				value: "",
			})
			availableFolders.forEach((path) => {
				const displayText = path === "" ? "/ (root)" : path
				this.select.createEl("option", { text: displayText, value: path })
			})
		}

		this.preserveCurrentValue(currentValue, "path")
	}

	/**
	 * Preserves the current value if it doesn't exist in new options
	 */
	private preserveCurrentValue(
		currentValue: string,
		ruleType: "tag" | "path"
	): void {
		if (!currentValue || currentValue.trim() === "") {
			return
		}

		const valueExists = Array.from(this.select.options).some(
			(opt) => opt.value === currentValue
		)

		if (valueExists) {
			this.select.value = currentValue
			return
		}

		// Value doesn't exist in new options - preserve it
		const preservedOption = document.createElement("option")
		const existingRulePattern = getCurrentRulePattern(
			this.plugin.settings,
			this.ruleId
		)
		const isCurrentRulePattern =
			existingRulePattern === currentValue

		if (isCurrentRulePattern) {
			// Current rule's pattern - show it normally
			preservedOption.text =
				ruleType === "tag"
					? currentValue
					: currentValue === ""
					? "/ (root)"
					: currentValue
		} else {
			// Not the current rule's pattern - mark as not found
			preservedOption.text = currentValue + " (not found)"
		}
		preservedOption.value = currentValue

		// Insert after the placeholder option (index 0) if it exists
		if (this.select.options.length > 0) {
			this.select.insertBefore(
				preservedOption,
				this.select.options[1] || null
			)
		} else {
			this.select.appendChild(preservedOption)
		}
		this.select.value = currentValue
	}

	/**
	 * Gets all tags (for empty state check)
	 */
	private getAllTags(): string[] {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tags = (this.plugin.app.metadataCache as any).getTags?.() as
			| Record<string, number>
			| undefined
		return tags ? Object.keys(tags).map((tag) => tag.substring(1)) : []
	}

	/**
	 * Gets all folders (for empty state check)
	 */
	private getAllFolders(): string[] {
		const allFolders = this.plugin.app.vault.getAllFolders()
		return allFolders.map((folder) => folder.path)
	}

	/**
	 * Adds change event listener
	 */
	onChange(callback: () => void): void {
		this.select.addEventListener("change", callback)
	}
}

