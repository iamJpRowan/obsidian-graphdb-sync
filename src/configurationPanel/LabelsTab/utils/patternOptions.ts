import type { App } from "obsidian"
import type { PluginSettings } from "../../../types"
import { getUsedPatterns } from "./patternUniqueness"
import { ConfigurationService } from "../../../services/ConfigurationService"

/**
 * Gets all available tags from Obsidian
 * @param app - Obsidian app instance
 * @returns Array of tag names (without # prefix)
 */
export function getAllTags(app: App): string[] {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tags = (app.metadataCache as any).getTags?.() as
		| Record<string, number>
		| undefined
	return tags ? Object.keys(tags).map((tag) => tag.substring(1)).sort() : []
}

/**
 * Gets all available folders from Obsidian vault
 * @param app - Obsidian app instance
 * @returns Array of folder paths (empty string for root)
 */
export function getAllFolders(app: App): string[] {
	const allFolders = app.vault.getAllFolders()
	return allFolders.map((folder) => folder.path).sort()
}

/**
 * Gets available tags that are not already in use
 * @param app - Obsidian app instance
 * @param settings - Plugin settings
 * @param ruleId - Current rule ID to exclude from check
 * @returns Array of available tag names
 */
export function getAvailableTags(
	app: App,
	settings: PluginSettings,
	ruleId: string
): string[] {
	const allTags = getAllTags(app)
	const usedPatterns = getUsedPatterns(settings, ruleId, "tag")
	return allTags.filter((tag) => !usedPatterns.has(tag))
}

/**
 * Gets available folders that are not already in use
 * @param app - Obsidian app instance
 * @param settings - Plugin settings
 * @param ruleId - Current rule ID to exclude from check
 * @returns Array of available folder paths
 */
export function getAvailableFolders(
	app: App,
	settings: PluginSettings,
	ruleId: string
): string[] {
	const allFolders = getAllFolders(app)
	const usedPatterns = getUsedPatterns(settings, ruleId, "path")
	return allFolders.filter((path) => !usedPatterns.has(path))
}

/**
 * Checks if a tag exists in Obsidian
 * @param app - Obsidian app instance
 * @param tagName - Tag name to check (without # prefix)
 * @returns True if tag exists, false otherwise
 */
export function tagExists(app: App, tagName: string): boolean {
	const allTags = getAllTags(app)
	return allTags.includes(tagName)
}

/**
 * Checks if a folder exists in Obsidian vault
 * @param app - Obsidian app instance
 * @param folderPath - Folder path to check
 * @returns True if folder exists, false otherwise
 */
export function folderExists(app: App, folderPath: string): boolean {
	const allFolders = getAllFolders(app)
	return allFolders.includes(folderPath)
}

/**
 * Gets the current rule's pattern if it exists
 * @param settings - Plugin settings
 * @param ruleId - Rule ID
 * @returns Current rule's pattern or null
 */
export function getCurrentRulePattern(
	settings: PluginSettings,
	ruleId: string
): string | null {
	const rule = ConfigurationService.getLabelRule(settings, ruleId)
	return rule?.pattern || null
}

