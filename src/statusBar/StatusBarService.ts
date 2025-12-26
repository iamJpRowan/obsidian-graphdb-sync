import { Menu } from "obsidian"
import { StateService } from "../services/StateService"
import { MigrationService } from "../services/MigrationService"
import { openSettings } from "../utils/obsidianApi"
import type GraphDBSyncPlugin from "../main"

/**
 * Service for managing the status bar item
 */
export class StatusBarService {
	private statusBarItem: HTMLElement | null = null
	private statusBarIcon: HTMLElement | null = null
	private lastStatusBarState: {
		colorClass: string
		shouldAnimate: boolean
	} | null = null

	/**
	 * Sets up status bar item with context menu
	 */
	setup(plugin: GraphDBSyncPlugin): void {
		this.statusBarItem = plugin.addStatusBarItem()
		if (!this.statusBarItem) {
			return
		}

		this.statusBarItem.addClass("graphdb-status-bar-item")

		// Create icon element - try using SVG directly as Obsidian's icon system
		// might not process data-lucide on dynamically created status bar items
		this.statusBarIcon = this.statusBarItem.createSpan({
			attr: {
				"aria-label": "GraphDB Sync",
			},
		})

		// Set initial icon using SVG directly - always use database icon
		this.setStatusBarIcon()

		// Also try setting data-lucide in case Obsidian processes it later
		this.statusBarIcon.setAttribute("data-lucide", "database")

		// Add click handler - primary click shows menu
		this.statusBarItem.addEventListener("click", (evt: MouseEvent) => {
			evt.preventDefault()
			evt.stopPropagation()
			this.showStatusBarMenu(evt, plugin)
		})
	}

	/**
	 * Shows context menu for status bar item
	 */
	private showStatusBarMenu(evt: MouseEvent, plugin: GraphDBSyncPlugin): void {
		const menu = new Menu()
		const state = StateService.getState()

		// Migration status
		if (state.migration.running) {
			menu.addItem((item) => {
				if (state.migration.paused) {
					item.setTitle("Migration: Paused")
					item.setIcon("pause")
				} else {
					const progress = state.migration.progress
					if (progress) {
						item.setTitle(
							`Migration: ${progress.current}/${progress.total} files`
						)
					} else {
						item.setTitle("Migration: Running")
					}
					item.setIcon("database")
				}
				item.setDisabled(true)
			})

			menu.addSeparator()

			// Migration actions
			if (state.migration.paused) {
				menu.addItem((item) => {
					item.setTitle("Resume migration")
					item.setIcon("play")
					item.onClick(() => {
						MigrationService.resume()
					})
				})
			} else {
				menu.addItem((item) => {
					item.setTitle("Pause migration")
					item.setIcon("pause")
					item.onClick(() => {
						MigrationService.pause()
					})
				})
			}

			menu.addItem((item) => {
				item.setTitle("Cancel migration")
				item.setIcon("x")
				item.onClick(() => {
					MigrationService.cancel()
				})
			})
		} else {
			menu.addItem((item) => {
				item.setTitle("Migration: Idle")
				item.setIcon("database")
				item.setDisabled(true)
			})

			menu.addSeparator()

			// Start migration action
			menu.addItem((item) => {
				item.setTitle("Start migration")
				item.setIcon("play")
				item.onClick(async () => {
					await plugin.startMigration()
				})
			})
		}

		menu.addSeparator()

		// Navigation
		menu.addItem((item) => {
			item.setTitle("Open sync status")
			item.setIcon("database")
			item.onClick(() => {
				plugin.activateView()
			})
		})

		menu.addItem((item) => {
			item.setTitle("Open settings")
			item.setIcon("settings")
			item.onClick(() => {
				openSettings(plugin.app)
			})
		})

		menu.showAtPosition({ x: evt.clientX, y: evt.clientY })
	}

	/**
	 * Updates the status bar icon and state
	 * Only updates DOM when state actually changes to avoid interfering with clicks
	 */
	update(settings: { lastMigrationResult?: { success: boolean } }): void {
		if (!this.statusBarIcon || !this.statusBarItem) return

		const state = StateService.getState()

		// Determine state - always use database icon
		let colorClass = ""
		let shouldAnimate = false

		if (state.migration.running) {
			colorClass = "graphdb-status-warning"
			shouldAnimate = !state.migration.paused
		} else if (
			settings.lastMigrationResult &&
			!settings.lastMigrationResult.success
		) {
			colorClass = "graphdb-status-error"
		} else {
			colorClass = ""
		}

		// Only update if state actually changed
		const newState = { colorClass, shouldAnimate }
		if (
			this.lastStatusBarState &&
			this.lastStatusBarState.colorClass === newState.colorClass &&
			this.lastStatusBarState.shouldAnimate === newState.shouldAnimate
		) {
			// State hasn't changed, skip DOM updates
			return
		}

		this.lastStatusBarState = newState

		// Icon is set once during setup and never changes, so no need to recreate it

		// Update classes
		this.statusBarItem.removeClass(
			"graphdb-status-warning",
			"graphdb-status-error",
			"graphdb-status-animating"
		)
		if (colorClass) {
			this.statusBarItem.addClass(colorClass)
		}

		// Handle fade animation
		if (shouldAnimate) {
			this.startIconAnimation()
		} else {
			this.stopIconAnimation()
		}
	}

	/**
	 * Sets the status bar icon using SVG directly
	 * This is a fallback when Obsidian's data-lucide system doesn't work
	 * Always uses the database icon
	 */
	private setStatusBarIcon(): void {
		if (!this.statusBarIcon) return

		// Clear existing content
		this.statusBarIcon.empty()

		// Create SVG element using document.createElementNS for SVG namespace
		const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg")
		svgEl.setAttribute("width", "16")
		svgEl.setAttribute("height", "16")
		svgEl.setAttribute("viewBox", "0 0 24 24")
		svgEl.setAttribute("fill", "none")
		svgEl.setAttribute("stroke", "currentColor")
		svgEl.setAttribute("stroke-width", "2")
		svgEl.setAttribute("stroke-linecap", "round")
		svgEl.setAttribute("stroke-linejoin", "round")

		// Create SVG paths for database icon
		const ellipse1 = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"ellipse"
		)
		ellipse1.setAttribute("cx", "12")
		ellipse1.setAttribute("cy", "5")
		ellipse1.setAttribute("rx", "9")
		ellipse1.setAttribute("ry", "3")
		svgEl.appendChild(ellipse1)
		const path1 = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		)
		path1.setAttribute("d", "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3")
		svgEl.appendChild(path1)
		const path2 = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		)
		path2.setAttribute("d", "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5")
		svgEl.appendChild(path2)

		// Append SVG to icon container
		this.statusBarIcon.appendChild(svgEl)

		// Also keep data-lucide for Obsidian's system (in case it processes it later)
		this.statusBarIcon.setAttribute("data-lucide", "database")
	}

	/**
	 * Starts icon fade animation
	 */
	private startIconAnimation(): void {
		// Add animating class to trigger CSS animation
		this.statusBarItem?.addClass("graphdb-status-animating")
	}

	/**
	 * Stops icon animation
	 */
	private stopIconAnimation(): void {
		// Remove animating class to stop CSS animation
		this.statusBarItem?.removeClass("graphdb-status-animating")
	}

	/**
	 * Cleans up the status bar item
	 */
	cleanup(): void {
		// Stop animation
		this.statusBarItem?.removeClass("graphdb-status-animating")
		this.statusBarItem = null
		this.statusBarIcon = null
		this.lastStatusBarState = null
	}
}

