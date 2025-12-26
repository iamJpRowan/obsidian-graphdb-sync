import type { App } from "obsidian"
import { extractFrontMatter } from "../utils/frontMatterExtractor"
import { aggregateProperties } from "../utils/propertyAnalyzer/aggregation"
import type { PropertyInfo, PropertyStats, FrontMatterValue } from "../types"

/**
 * Service for discovering properties in the vault
 * On-demand scanning with simple caching
 */
export class PropertyDiscoveryService {
	private static cachedProperties: PropertyInfo[] | null = null
	private static cacheTimestamp: number = 0
	private static readonly CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes

	/**
	 * Discovers all properties in the vault
	 * Uses cache if available and fresh
	 */
	static async discoverProperties(app: App, forceRefresh: boolean = false): Promise<PropertyInfo[]> {
		// Check cache
		if (!forceRefresh && this.cachedProperties && Date.now() - this.cacheTimestamp < this.CACHE_DURATION_MS) {
			return this.cachedProperties
		}

		// Scan vault
		const markdownFiles = app.vault.getMarkdownFiles()
		const propertyData = new Map<string, FrontMatterValue[]>()

		// Collect all front matter properties
		for (const file of markdownFiles) {
			const frontMatter = extractFrontMatter(app, file)
			if (frontMatter) {
				for (const [key, value] of Object.entries(frontMatter)) {
					if (!propertyData.has(key)) {
						propertyData.set(key, [])
					}
					propertyData.get(key)!.push(value)
				}
			}
		}

		// Aggregate properties
		const stats: PropertyStats[] = aggregateProperties(propertyData, markdownFiles.length, app)

		// Convert to simplified PropertyInfo
		const properties: PropertyInfo[] = stats.map((stat) => ({
			name: stat.name,
			type: stat.type,
			pattern: stat.valuePattern,
			frequency: stat.frequency,
			sampleValues: stat.sampleValues,
			isArray: stat.isArray,
			hasWikilinks: stat.valuePattern === "wikilink" || stat.arrayItemPattern === "wikilink",
		}))

		// Cache results
		this.cachedProperties = properties
		this.cacheTimestamp = Date.now()

		return properties
	}

	/**
	 * Clears the property cache
	 */
	static clearCache(): void {
		this.cachedProperties = null
		this.cacheTimestamp = 0
	}

	/**
	 * Gets cached properties if available
	 */
	static getCachedProperties(): PropertyInfo[] | null {
		return this.cachedProperties
	}
}

