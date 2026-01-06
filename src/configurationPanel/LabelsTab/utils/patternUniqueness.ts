import type { PluginSettings } from "../../../types"
import { ConfigurationService } from "../../../services/ConfigurationService"

/**
 * Checks if a pattern (tag or folder) is already in use by another rule
 * @param settings - Plugin settings
 * @param ruleId - Current rule ID to exclude from check
 * @param pattern - Pattern to check
 * @param type - Rule type ("tag" or "path")
 * @returns True if pattern is already in use, false otherwise
 */
export function isPatternInUse(
	settings: PluginSettings,
	ruleId: string,
	pattern: string,
	type: "tag" | "path"
): boolean {
	const allRules = ConfigurationService.getLabelRules(settings)
	return allRules.some(
		(r) => r.id !== ruleId && r.type === type && r.pattern === pattern
	)
}

/**
 * Gets all patterns currently in use for a given rule type
 * @param settings - Plugin settings
 * @param ruleId - Current rule ID to exclude from check
 * @param type - Rule type ("tag" or "path")
 * @returns Set of patterns in use
 */
export function getUsedPatterns(
	settings: PluginSettings,
	ruleId: string,
	type: "tag" | "path"
): Set<string> {
	const allRules = ConfigurationService.getLabelRules(settings)
	return new Set(
		allRules
			.filter((r) => r.id !== ruleId && r.type === type)
			.map((r) => r.pattern)
	)
}

/**
 * Checks if a label name is already in use by another rule
 * @param settings - Plugin settings
 * @param ruleId - Current rule ID to exclude from check
 * @param labelName - Label name to check
 * @returns True if label name is already in use, false otherwise
 */
export function isLabelNameInUse(
	settings: PluginSettings,
	ruleId: string,
	labelName: string
): boolean {
	const allRules = ConfigurationService.getLabelRules(settings)
	return allRules.some((r) => r.id !== ruleId && r.labelName === labelName)
}

