# UI and Configuration Logic Summary

## Overview
The property mapping configuration system manages the relationship between Obsidian front matter properties and Neo4j graph database mappings. The UI ensures that the displayed state always matches the persisted settings.

## Core Data Flow

### 1. Mapping State Management

**Source of Truth**: `plugin.settings.propertyMappings[propertyName]`

- **Initialization**: Each property card reads from `getPropertyMapping(settings, propertyName)` or creates a default mapping object
- **Local State**: A `mapping` object is maintained per property card for UI updates
- **Synchronization**: `refreshMappingFromSettings()` ensures local state matches persisted settings

### 2. Mapping Type Selection Flow

**When "None" is selected:**
1. `mapping.mappingType = undefined` (in dropdown handler)
2. `mapping.config = undefined`
3. `mapping.enabled = false`
4. Relationship field DOM element is removed (clears input values)
5. Mapping is deleted from `plugin.settings.propertyMappings[propertyName]`
6. Settings are saved immediately (no debounce)
7. `refreshMappingFromSettings()` resets local mapping to defaults

**When "Relationship" or "Node Property" is selected:**
1. `mapping.mappingType` is set to the selected type
2. Fresh config is created (always, to avoid reusing old values)
3. For relationship: `{ relationshipType: "", direction: "outgoing" }`
4. For node_property: `{}` (placeholder)
5. `debouncedSave()` is called (500ms delay)
6. `updateConfigFormVisibility()` shows/hides appropriate fields

### 3. Enable Toggle Logic

**Simple Rule**: Toggle is enabled only if `mapping.mappingType !== undefined`

- **Disabled States**:
  - New properties (no mapping type selected)
  - "None" selected
  - Mapping removed from settings

- **Enabled States**:
  - "Relationship" selected
  - "Node Property" selected

- **State Updates**:
  - `updateEnableToggleState()` is called when mapping type changes
  - Uses Obsidian toggle API (`setDisabled()`, `setValue()`) when available
  - Falls back to DOM manipulation for initial setup

### 4. Relationship Field Management

**Creation**:
- Created when `mappingType === "relationship"` and field doesn't exist
- Always creates fresh config with empty `relationshipType: ""`
- Field reads initial value from `mapping.config.relationshipType`

**Removal**:
- Removed when switching away from "relationship"
- Removed when config becomes invalid
- Removed when "None" is selected (to clear DOM input values)

**Updates**:
- Real-time validation on input
- Debounced save (500ms) on changes
- Preview updates in card header

### 5. Save Logic

**Immediate Save (No Debounce)**:
- When "None" is selected → delete mapping and save immediately

**Debounced Save (500ms)**:
- Relationship name input changes
- Direction toggle changes
- Enable toggle changes
- Mapping type changes (except "None")

**Save Behavior**:
- If `mappingType === undefined`: Delete from settings
- Otherwise: Save mapping to `propertyMappings[propertyName]`

### 6. State Synchronization Functions

**`refreshMappingFromSettings()`**:
- Reads current state from `plugin.settings.propertyMappings`
- Updates local `mapping` object to match
- Resets to defaults if no mapping exists

**`updateConfigFormVisibility()`**:
- Shows/hides relationship and node property fields based on `mappingType`
- Removes invalid fields
- Creates fresh fields with empty configs when needed

**`updateEnableToggleState()`**:
- Updates toggle disabled state based on `mappingType`
- Updates tooltip and CSS classes
- Ensures toggle value matches `mapping.enabled`

## Key Design Decisions

1. **Always Create Fresh Configs**: When switching mapping types, always create new config objects to prevent reusing old values
2. **Immediate Deletion for "None"**: No debounce when removing mappings to ensure clean state
3. **Single Source of Truth**: Settings are the source of truth; local state is synchronized
4. **DOM Cleanup**: Remove DOM elements when switching away to prevent stale values
5. **Simple Toggle Logic**: Only check if mapping type exists, nothing more complex

## Potential Simplification Opportunities

1. **Duplicate Config Creation**: Config is created in both `formHelpers.ts` (dropdown handler) and `updateConfigFormVisibility()` - could be unified
2. **Multiple Save Paths**: Immediate save for "None" vs debounced save for others - could be unified with a flag
3. **Field Removal Logic**: Field removal happens in multiple places (mapping type callback, `updateConfigFormVisibility`) - could be centralized
4. **State Refresh**: `refreshMappingFromSettings()` is only called for "None" - could be used more consistently

