import { Modal } from "obsidian"
import type { ValidationResult } from "../../types"
import type GraphDBSyncPlugin from "../../main"

/**
 * Modal for displaying validation issues
 */
export class ValidationIssuesModal extends Modal {
	private plugin: GraphDBSyncPlugin
	private validationResult: ValidationResult

	constructor(
		plugin: GraphDBSyncPlugin,
		validationResult: ValidationResult
	) {
		super(plugin.app)
		this.plugin = plugin
		this.validationResult = validationResult
	}

	onOpen(): void {
		const { contentEl } = this
		contentEl.empty()
		contentEl.addClass("graphdb-validation-issues-modal")

		// Title
		contentEl.createEl("h2", {
			text: `Validation Issues: ${this.validationResult.propertyName}`,
		})

		// Summary
		const summary = contentEl.createDiv("graphdb-validation-issues-summary")
		const issueCount = this.validationResult.filesWithIssues.length
		summary.createEl("strong", { text: `${issueCount} file(s) have issues:` })

		// Scrollable issues container
		const issuesContainer = contentEl.createDiv("graphdb-validation-issues-container")
		const issuesList = issuesContainer.createDiv("graphdb-validation-issues-list")

		this.validationResult.filesWithIssues.forEach((fileIssue) => {
			const issueItem = issuesList.createDiv("graphdb-validation-issues-item")

			// File link
			const fileLinkContainer = issueItem.createDiv("graphdb-validation-issues-file-container")
			const fileLink = fileLinkContainer.createEl("a", {
				cls: "internal-link",
				text: fileIssue.file.basename,
			})
			fileLink.setAttr("data-href", fileIssue.file.path)
			fileLink.setAttr("href", fileIssue.file.path)
			fileLink.setAttr("aria-label", `Open ${fileIssue.file.basename}`)

			fileLink.addEventListener("click", (e) => {
				e.preventDefault()
				this.app.workspace.openLinkText(fileIssue.file.path, "", false)
			})

			// Value and error message on same line if space allows
			const details = issueItem.createDiv("graphdb-validation-issues-details")
			const valueSpan = details.createSpan("graphdb-validation-issues-value")
			valueSpan.setText(`Value: ${fileIssue.value}`)

			const messageSpan = details.createSpan("graphdb-validation-issues-message")
			messageSpan.setText(fileIssue.issue.message)
		})

		// Close button
		const buttonContainer = contentEl.createDiv("graphdb-validation-issues-buttons")
		
		const closeButton = buttonContainer.createEl("button", {
			text: "Close",
		})
		closeButton.addEventListener("click", () => {
			this.close()
		})
	}

	onClose(): void {
		const { contentEl } = this
		contentEl.empty()
	}
}

