/**
 * Mapping type selector component
 * Dropdown for selecting mapping type (none, relationship, or node property types)
 */
export class MappingTypeSelector {
	private container: HTMLElement
	private select: HTMLSelectElement | null = null
	private onChange: (mappingType: string) => void

	constructor(
		container: HTMLElement,
		currentMappingType: "none" | "relationship" | "boolean" | "integer" | "float" | "date" | "datetime" | "string" | "list_string",
		onChange: (mappingType: string) => void
	) {
		this.container = container
		this.onChange = onChange
		this.render(currentMappingType)
	}

	private render(currentMappingType: string): void {
		this.container.createSpan({ text: "Mapping type: ", cls: "graphdb-property-config-label" })
		this.select = this.container.createEl("select", {
			cls: "graphdb-property-config-select",
		})
		this.select.createEl("option", { text: "None", value: "none" })
		this.select.createEl("option", { text: "Relationship", value: "relationship" })
		this.select.createEl("option", { text: "Boolean", value: "boolean" })
		this.select.createEl("option", { text: "Integer", value: "integer" })
		this.select.createEl("option", { text: "Float", value: "float" })
		this.select.createEl("option", { text: "Date", value: "date" })
		this.select.createEl("option", { text: "DateTime", value: "datetime" })
		this.select.createEl("option", { text: "String", value: "string" })
		this.select.createEl("option", { text: "List (String)", value: "list_string" })
		this.select.value = currentMappingType
		this.select.addEventListener("change", () => {
			if (this.select) {
				this.onChange(this.select.value)
			}
		})
	}

	/**
	 * Gets the current selected mapping type
	 */
	getValue(): string {
		return this.select?.value || "none"
	}

	/**
	 * Sets the mapping type value
	 */
	setValue(value: string): void {
		if (this.select) {
			this.select.value = value
		}
	}
}

