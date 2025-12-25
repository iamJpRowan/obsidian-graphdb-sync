import type { App, TFile } from "obsidian"
import type { FrontMatterValue } from "../types"

/**
 * Extracts front matter from a file using Obsidian's metadata cache
 * @param app - Obsidian app instance
 * @param file - File to extract front matter from
 * @returns Front matter object or null if no front matter exists
 */
export function extractFrontMatter(
	app: App,
	file: TFile
): Record<string, FrontMatterValue> | null {
	const cache = app.metadataCache.getFileCache(file)
	if (!cache || !cache.frontmatter) {
		return null
	}

	return cache.frontmatter
}

/**
 * Gets a TFile from a file path
 * @param app - Obsidian app instance
 * @param filePath - Path to the file (relative to vault root)
 * @returns TFile or null if not found
 */
export function getFileFromPath(app: App, filePath: string): TFile | null {
	const markdownFiles = app.vault.getMarkdownFiles()
	return markdownFiles.find((file) => file.path === filePath) || null
}





