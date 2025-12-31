# Queue-Based Sync System: Phase-Based Architecture

**Date:** December 31, 2025  
**Developer:** Jp Rowan  
**AI Model:** Claude Sonnet 4.5 (via Cursor)

## Context & Overview

This devlog documents the transition from a single monolithic sync operation to a queued, phase-based sync system. The new architecture enables property-specific syncs, sequential processing, and better user control. The queue system supports distinct sync phases (property-sync, relationship-sync, and future file-sync) with batching, deduplication, and individual history entries per phase. This foundation also sets the stage for future real-time sync on file updates.

The refactoring was motivated by the need to support granular sync operations (syncing individual properties or relationships) without requiring users to wait for a full sync to complete. The queue system allows multiple sync requests to be queued and processed sequentially, with each phase tracked independently.

## Major Architectural Decisions

### Queue-Based Sync Architecture

**Decision:** Replace direct sync execution with a queue system (`SyncQueueService`) that processes sync requests sequentially

**Rationale:**
- Users can queue multiple syncs without waiting for completion
- Prevents blocking UI while syncs are in progress
- Enables property-specific syncs without disabling sync functionality
- Foundation for future real-time sync on file updates
- Better separation between queue management and sync execution

**Attribution:** User request to enable queuing as precursor to real-time sync

**Implementation:**
- `SyncQueueService` manages queue state and processing
- Queue state integrated into `StateService` for centralized management
- Sequential processing (one item at a time)
- Auto-start processing when items are added
- Continue processing on errors (errors logged to history)

### Phase-Based Sync Types

**Decision:** Introduce three distinct queue item types: `property-sync`, `relationship-sync`, and `file-sync` (future)

**Rationale:**
- Each phase is a distinct operation with different requirements
- Enables granular control (sync specific properties or relationships)
- Each phase gets its own history entry for better tracking
- Replaces single multi-phase migration report with phase-specific reports
- Clear separation of concerns (node properties vs. relationships)

**Attribution:** User decision to make each migration report item a specific phase

**Implementation:**
- `SyncQueueItemType` discriminated union type
- Queue items specify type and properties to sync
- Processing logic routes to appropriate sync operation based on type
- History entries use discriminated union for type safety

### Simplified Queue Data Structure

**Decision:** Remove priority, timestamps, and source tracking; use simple array position, relative file paths, and `Set<string>` for properties

**Rationale:**
- Priority adds unnecessary complexity for single-user environment
- Timestamps not needed for queue ordering (array position sufficient)
- Source tracking not needed (ephemeral queue state)
- `Set<string>` provides automatic deduplication
- Simpler structure is easier to maintain and reason about

**Attribution:** User preference for simplest approach

**Implementation:**
- `SyncQueueItem` interface with minimal fields: `id`, `type`, `properties` (Set)
- Queue is simple array (position-based ordering)
- File paths use relative paths from vault root
- Properties stored as `Set<string>` for deduplication

### Property Batching and Merging

**Decision:** If a property sync is already queued, add additional properties to the existing queue item. Skip individual property syncs if a full sync of that type exists.

**Rationale:**
- Reduces redundant file iterations (batch similar sync phase types)
- Prevents duplicate queue items for the same property
- Full syncs cover all properties, so individual syncs are redundant
- Better performance by processing multiple properties in single pass

**Attribution:** User decision to batch similar sync phase types together

**Implementation:**
- `addPropertySync()` checks for existing queue items of same type
- Merges properties into existing item if found
- `findFullSync()` identifies full syncs (contain all enabled properties)
- Individual property syncs skipped if full sync exists
- Full syncs updated with newly enabled properties dynamically

### Full Sync Representation

**Decision:** Full syncs explicitly include all enabled properties in a `Set` rather than using `undefined` to represent "all properties"

**Rationale:**
- Enables dynamic property addition when properties are enabled during active sync
- Makes full sync state explicit and trackable
- Simplifies logic (no need to check for undefined)
- Allows individual property state tracking within full syncs
- Better UI state management (can show which properties are in full sync)

**Attribution:** User requirement to handle properties enabled after sync starts

**Implementation:**
- `addFullSync()` populates `properties` Set with all enabled properties
- `addPropertyToActiveFullSync()` adds properties to active full syncs
- Property row sync icons can check if property is in full sync's Set
- Removed all `undefined` checks (properties always present)

### Service Refactoring: MigrationService to SyncService

**Decision:** Split monolithic `MigrationService` into modular `SyncService` with separate operations: `syncNodePropertiesOnly()`, `syncRelationshipsOnly()`, and `syncAll()`

**Rationale:**
- Monolithic `migrate()` method was doing too many things
- Need granular operations for queue-based system
- Options object pattern improves method signature clarity
- Better separation of concerns (node sync vs. relationship sync)
- Enables future operations (cleanup, label mapping, etc.)

**Attribution:** User request to refactor for new use cases (cleanup, label mapping)

**Implementation:**
- Created `SyncService/` directory with modular structure:
  - `index.ts` - Public API (syncNodePropertiesOnly, syncRelationshipsOnly, syncAll)
  - `types.ts` - Service-specific types (SyncProgress, SyncOptions, SyncContext)
  - `infrastructure.ts` - Core infrastructure (connection, file discovery, pause/cancel)
  - `utils.ts` - Utility functions (type conversion, error categorization)
  - `operations/nodeSync.ts` - Node property syncing logic
  - `operations/relationshipSync.ts` - Relationship syncing logic
- `MigrationOptions` interface for flexible operation configuration
- Options object pattern: `{ nodePropertyFilter?, relationshipPropertyFilter?, skipNodeCreation?, skipRelationshipCreation? }`

### History Entry Structure

**Decision:** Switch to discriminated union (`SyncHistoryEntry`) for type safety, with separate entry types for property-sync, relationship-sync, and file-sync

**Rationale:**
- Type safety for different sync operation types
- Each entry type has appropriate fields (property-sync has nodeErrors, relationship-sync has propertyStats)
- Better extensibility for future entry types (e.g., remove-all)
- More informative titles showing which properties were synced
- Clearer error reporting per operation type

**Attribution:** User request for more informative history entries

**Implementation:**
- `SyncHistoryEntry` discriminated union type
- `PropertySyncHistoryEntry` - node property sync results
- `RelationshipSyncHistoryEntry` - relationship sync results with property stats
- `FileSyncHistoryEntry` - future single-file sync results
- `RemoveAllHistoryEntry` - placeholder for future cleanup operation
- History modal uses type narrowing for type-specific rendering

### Renaming Migration to Sync

**Decision:** Rename `MigrationService` to `SyncService`, `MigrationPanel` to `SyncPanel`, and update terminology throughout to use "sync" instead of "migration"

**Rationale:**
- "Migration" implies one-time operation, "sync" implies ongoing operation
- Better reflects the queue-based, repeatable nature of operations
- Reserve "full sync" for syncing everything (all properties and relationships)
- More accurate terminology for property-specific and relationship-specific operations

**Attribution:** User request to rename for clarity

**Implementation:**
- Renamed `MigrationService.ts` → `SyncService/` directory
- Renamed `MigrationPanel.ts` → `SyncPanel.ts`
- Updated all UI text from "migration" to "sync"
- Updated type names: `MigrationProgress` → `SyncProgress`, `MigrationOptions` → `SyncOptions`
- Updated state service references from "migration" to "sync"

## Implementation Phases

### Phase 1: Queue Data Structure Design

- Defined `SyncQueueItem` and `SyncQueueState` types
- Simplified structure (removed priority, timestamps, source)
- Used `Set<string>` for properties (automatic deduplication)
- Decision to use array position for ordering

### Phase 2: SyncQueueService Implementation

- Created `SyncQueueService` for queue management
- Implemented `addPropertySync()` with merging logic
- Implemented `addFullSync()` (creates property-sync then relationship-sync items)
- Implemented `processQueue()` for sequential processing
- Integrated queue state into `StateService`

### Phase 3: Property Row Sync Integration

- Added sync icon to property rows (clickable icon, not button)
- Created `PropertySyncHandler` for sync state management
- Implemented `SyncIcon` component with states (normal, queued, processing)
- State updates based on queue position (queued vs. processing)
- Sync icon always visible when mapping is configured

### Phase 4: Queue Modal UI

- Created `SyncQueueModal` similar to history modal
- Displays current and pending queue items
- Shows sync type and properties for each item
- Remove button for pending items
- Reactive to queue state changes (subscription-based)

### Phase 5: Service Refactoring

- Split `MigrationService` into modular `SyncService`
- Created separate operation files (nodeSync, relationshipSync)
- Extracted infrastructure and utilities
- Implemented options object pattern
- Updated `SyncQueueService` to use new operations

### Phase 6: UI Enhancements

- Added pause/resume/cancel controls to status bar
- Implemented 5-second cancel delay with undo option
- Added "View queue" link next to "View history"
- Reordered status bar rows (action line above progress bar)
- Reserved height for progress bar to prevent UI jumping
- Updated progress status messages ("Updating properties", "Creating relationships", "Creating nodes")

### Phase 7: History Modal Updates

- Refactored to use `SyncHistoryEntry` discriminated union
- Removed backward compatibility for old migration entries
- Added informative titles (e.g., "Property sync: tags, status")
- Type-specific detail rendering (property-sync vs. relationship-sync)
- Updated modal title to "Sync history"

### Phase 8: Code Cleanup

- Removed all `undefined` properties logic
- Made `properties` required in all types
- Simplified conditional checks throughout codebase
- Updated UI messaging ("No properties" instead of "All properties")

## Key Technical Details

### Queue Service Architecture

**SyncQueueService:**
- Static class managing queue state and processing
- Queue state stored in `StateService` (centralized)
- Sequential processing (one item at a time)
- Auto-start processing when items added
- Error handling: continue processing on errors, log to history

**Queue Operations:**
- `addPropertySync()` - Add property to queue (merges if exists)
- `addFullSync()` - Add property-sync then relationship-sync items
- `addPropertyToActiveFullSync()` - Add property to active full sync
- `removeItem()` - Remove item from queue by ID
- `processQueue()` - Process items sequentially
- `findFullSync()` - Identify full sync items (contain all enabled properties)

### Sync Service Architecture

**SyncService Structure:**
```
SyncService/
├── index.ts              # Public API
├── types.ts              # Service types (SyncProgress, SyncOptions, SyncContext)
├── infrastructure.ts     # Connection, file discovery, pause/cancel
├── utils.ts              # Type conversion, error categorization
├── operations/
│   ├── nodeSync.ts       # Node property syncing
│   └── relationshipSync.ts # Relationship syncing
```

**Public API:**
- `syncNodePropertiesOnly()` - Sync only node properties
- `syncRelationshipsOnly()` - Sync only relationships
- `syncAll()` - Full sync (nodes then relationships)
- `cancelSync()` - Cancel current sync
- `pauseSync()` - Pause current sync
- `resumeSync()` - Resume paused sync
- `isSyncRunning()` - Check if sync is active
- `isSyncPaused()` - Check if sync is paused

**Options Pattern:**
```typescript
interface SyncOptions {
  nodePropertyFilter?: string[]        // Filter node properties
  relationshipPropertyFilter?: string[] // Filter relationship properties
  skipNodeCreation?: boolean          // Skip node creation phase
  skipRelationshipCreation?: boolean   // Skip relationship creation phase
}
```

### State Management Integration

**Queue State:**
- Integrated into `StateService` as `queue: SyncQueueState`
- Emits "queue" events on state changes
- Components subscribe to "queue" or "all" events
- Queue state: `{ queue: SyncQueueItem[], current: SyncQueueItem | null }`

**Property Row State:**
- `PropertySyncHandler` subscribes to queue state
- Determines sync icon state: normal, queued, or processing
- Checks if property is in queue item's properties Set
- Checks if property is in full sync (all enabled properties)

### UI Components

**SyncPanel (formerly MigrationPanel):**
- Action line: status text, view history link, run sync button
- Status bar line: progress bar, view queue link, pause/resume/cancel controls
- Reserved height prevents UI jumping
- Optimized re-rendering (only updates progress bar on frequent changes)

**SyncQueueModal:**
- Displays current and pending queue items
- Shows sync type and properties for each item
- Remove button for pending items
- Reactive to queue state changes (subscription-based)

**Property Row Sync Icon:**
- Clickable icon (not button) with text
- States: normal (disabled if mapping not enabled), queued, processing
- Always visible when mapping is configured
- Updates based on queue state

**MigrationHistoryModal:**
- Uses `SyncHistoryEntry` discriminated union
- Type-specific rendering (property-sync vs. relationship-sync)
- Informative titles showing properties synced
- Property-specific error details for relationship syncs

### Progress Status Messages

**Status Types:**
- `"scanning"` - Scanning files
- `"connecting"` - Connecting to Neo4j
- `"creating_nodes"` - Creating nodes (full sync)
- `"updating_properties"` - Updating specific properties
- `"creating_relationships"` - Creating relationships

**Logic:**
- Property-only syncs show "updating_properties"
- Relationship-only syncs show "creating_relationships"
- Full syncs show "creating_nodes" then "creating_relationships"

### Cancel Delay with Undo

**Implementation:**
- 5-second delay before actual cancellation
- Sync pauses immediately when cancel clicked
- Cancel button transforms to undo button during delay
- "Cancelling in X..." text appears in progress status (error color)
- Undo button resumes sync and clears pending cancel
- If delay completes, sync is cancelled and queue item removed

## Lessons Learned & Considerations

### Queue State Management

- Initial implementation had race conditions with queue state updates
- Solution: Centralized queue state in `StateService` with event emissions
- Components subscribe to queue state changes for reactive updates
- Queue state snapshots prevent stale state issues

### UI Re-rendering Optimization

- Frequent progress updates caused control icons to lose event listeners
- Solution: Track last known state, only re-render structure when needed
- Progress bar updates separately without full re-render
- Prevents event listener removal on every progress update

### Full Sync Representation

- Initial approach used `undefined` to represent "all properties"
- Problem: Can't track individual properties or add properties dynamically
- Solution: Explicit Set of all enabled properties
- Enables dynamic property addition and individual property state tracking

### Type Safety with Discriminated Unions

- History entries needed different fields per type
- Discriminated union provides type safety and better IntelliSense
- Type narrowing in UI components enables type-specific rendering
- Extensible for future entry types (file-sync, remove-all)

### Service Modularity

- Monolithic service was difficult to extend
- Modular structure enables future operations (cleanup, label mapping)
- Options object pattern improves method signature clarity
- Clear separation: infrastructure, operations, utilities

### Property Batching

- Individual property syncs would iterate over all files multiple times
- Batching similar sync phase types reduces file iterations
- Merging properties into existing queue items prevents duplicates
- Full sync detection prevents redundant individual syncs

## Future Considerations

### Potential Enhancements

- **File-specific sync**: Implement `file-sync` queue item type for single file updates
- **Real-time sync**: Trigger sync on file updates using queue system
- **Cleanup operation**: Add "remove-all" queue item type to delete all nodes/relationships
- **Label mapping**: Add label sync operation using tag mapping logic
- **Batch size configuration**: Allow configuration of transaction batch sizes
- **Error recovery**: Retry failed items automatically or with user confirmation

### Areas for Future Refactoring

- Consider extracting queue item rendering to separate component
- Evaluate if queue processing should support parallel execution (currently sequential)
- Potential queue persistence for resuming after Obsidian restart
- Consider priority system if use cases require it

### Known Limitations

- Queue is ephemeral (lost on plugin reload)
- Sequential processing only (no parallel syncs)
- No queue persistence across Obsidian restarts
- File-sync type not yet implemented

## Conclusion

The queue-based sync system successfully provides granular control over sync operations, enabling property-specific and relationship-specific syncs without blocking the UI. The phase-based architecture with individual history entries provides better tracking and user feedback. The modular `SyncService` structure and discriminated union history entries provide a solid foundation for future enhancements like file-specific syncs, cleanup operations, and real-time sync capabilities.

