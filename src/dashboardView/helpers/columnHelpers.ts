import { setIcon } from "obsidian"

/**
 * Creates a sample values column
 */
export function createSampleColumn(
	container: HTMLElement,
	sampleValues: string[]
): void {
	const samplesColumn = container.createDiv(
		"graphdb-analysis-property-card-collapsible-column"
	)
	samplesColumn.createDiv({
		text: "Sample values:",
		cls: "graphdb-analysis-property-card-column-title",
	})
	const samplesList = samplesColumn.createEl("ul", {
		cls: "graphdb-analysis-property-card-samples-list",
	})
	sampleValues.forEach((sample) => {
		samplesList.createEl("li", {
			text: sample,
			cls: "graphdb-analysis-property-card-sample-value",
		})
	})
}

/**
 * Creates an issue column with icon and samples
 */
export function createIssueColumn(
	container: HTMLElement,
	title: string,
	iconName: string,
	samples: Array<{ value: string } | string>,
	warningColor: boolean = false
): void {
	const column = container.createDiv(
		"graphdb-analysis-property-card-collapsible-column"
	)
	const titleEl = column.createDiv(
		"graphdb-analysis-property-card-column-title"
	)
	const icon = titleEl.createSpan(
		`graphdb-analysis-property-card-column-title-icon${
			warningColor ? " graphdb-analysis-property-card-column-title-icon-warning" : ""
		}`
	)
	setIcon(icon, iconName)
	titleEl.createSpan({
		text: title,
	})
	const list = column.createEl("ul", {
		cls: "graphdb-analysis-property-card-samples-list",
	})
	samples.slice(0, 5).forEach((item) => {
		const li = list.createEl("li")
		const value = typeof item === "string" ? item : item.value
		li.createSpan({
			text: value,
			cls: "graphdb-analysis-property-card-sample-value graphdb-analysis-property-card-sample-warning",
		})
	})
}

