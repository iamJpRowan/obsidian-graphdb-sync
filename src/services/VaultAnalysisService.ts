import type { App, TFile } from "obsidian"
import type {
	VaultAnalysisResult,
	AnalysisProgressCallback,
	FrontMatterValue,
} from "../types"
import {
	aggregateProperties,
} from "../utils/propertyAnalyzer"

/**
 * Service for analyzing vault front matter properties
 */
export class VaultAnalysisService {
	/**
	 * Analyzes all markdown files in the vault
	 * @param app - Obsidian app instance
	 * @param onProgress - Optional progress callback
	 * @returns Analysis result with property statistics
	 */
	static async analyze(
		app: App,
		onProgress?: AnalysisProgressCallback
	): Promise<VaultAnalysisResult> {
		// Get all markdown files
		const files = this.getMarkdownFiles(app)
		const totalFiles = files.length

		if (onProgress) {
			onProgress({
				current: 0,
				total: totalFiles,
				status: "scanning",
			})
		}

		// Collect property data across all files
		const propertyData = new Map<string, FrontMatterValue[]>()
		let filesWithFrontMatter = 0

		// Process each file
		for (let i = 0; i < files.length; i++) {
			const file = files[i]

			if (onProgress) {
				onProgress({
					current: i + 1,
					total: totalFiles,
					status: "analyzing",
					currentFile: file.path,
				})
			}

			const frontMatter = this.getFrontMatter(app, file)

			if (frontMatter && Object.keys(frontMatter).length > 0) {
				filesWithFrontMatter++

				// Collect all properties and their values
				Object.entries(frontMatter).forEach(([key, value]) => {
					if (!propertyData.has(key)) {
						propertyData.set(key, [])
					}
					propertyData.get(key)!.push(value)
				})
			}
		}

		if (onProgress) {
			onProgress({
				current: totalFiles,
				total: totalFiles,
				status: "complete",
			})
		}

		// Aggregate and analyze properties (pass app for file validation)
		const properties = aggregateProperties(propertyData, totalFiles, app)

		return {
			totalFiles,
			filesWithFrontMatter,
			properties,
			analysisDate: Date.now(),
		}
	}

	/**
	 * Gets all markdown files from vault
	 */
	private static getMarkdownFiles(app: App): TFile[] {
		return app.vault.getMarkdownFiles()
	}

	/**
	 * Extracts front matter from file using Obsidian's metadata cache
	 */
	private static getFrontMatter(
		app: App,
		file: TFile
	): Record<string, FrontMatterValue> | null {
		const cache = app.metadataCache.getFileCache(file)
		if (!cache || !cache.frontmatter) {
			return null
		}

		return cache.frontmatter
	}
}

