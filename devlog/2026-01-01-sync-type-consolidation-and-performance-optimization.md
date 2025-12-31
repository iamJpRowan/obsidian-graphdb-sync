# Sync Type Consolidation and Performance Optimization

**Date:** January 1, 2026  
**Developer:** Jp Rowan  
**AI Model:** Claude Sonnet 4.5 (via Cursor)

## Context & Overview

This devlog documents a major refactor focused on type system consolidation and performance optimization. The work unified the queue and history type systems into a single lifecycle-aware type, integrated Neo4j statistics reporting, and implemented UNWIND batching for significant performance improvements.

The refactoring was motivated by the need to:
- Simplify the type system by eliminating duplication between queue items and history entries
- Capture and report accurate Neo4j statistics (nodes created/updated, relationships created/updated)
- Improve sync performance through query batching, particularly for relationship syncs which were identified as the slowest part of the sync process
- Provide configurable batch sizing for optimal performance across different vault sizes

With Neo4j running locally, the bottleneck was query count rather than network latency. The original implementation executed ~3 queries per relationship (target node creation, source validation, relationship creation), resulting in thousands of queries for large vaults.

## Major Architectural Decisions

### Unified SyncItem Type System

**Decision:** Consolidate `SyncQueueItem` and `SyncHistoryEntry` into a single `SyncItem` discriminated union type that tracks the full lifecycle of a sync operation.

**Rationale:**
- Eliminates duplication between queue and history data structures
- Single object can represent sync state from queued → processing → completed/cancelled/error
- Enables showing current state in queue view and final state in history view
- Simplifies type system and reduces maintenance burden
- Properties can be stored as `Set<string>` during queue processing (for efficient deduplication) and converted to `string[]` when persisted to history

**Attribution:** User decision to consolidate queue and history types for better maintainability

**Implementation:**
- Created `BaseSyncItem` interface with common fields (id, properties, status, timing, results)
- Extended with type-specific interfaces: `PropertySyncItem`, `RelationshipSyncItem`, `FileSyncItem`
- `SyncItem` is a discriminated union of these types
- `SyncItemStatus` enum tracks lifecycle: `"queued" | "scanning" | "processing" | "completed" | "cancelled" | "error"`
- Properties stored as `Set<string>` in queue, converted to `string[]` when moved to history
- Type guards (`isPropertySyncItem`, `isRelationshipSyncItem`) for safe type narrowing

**Key Changes:**
- `SyncQueueService` now uses `SyncItem` for both queue and history
- `PluginSettings.syncHistory` changed from `SyncHistoryEntry[]` to `SyncItem[]`
- `SyncQueueState` uses `SyncItem[]` for queue and `SyncItem | null` for current
- All UI components updated to use unified type with type guards

### Neo4j Statistics Integration

**Decision:** Capture and report Neo4j driver statistics from query results, including nodes created/updated, properties set, and relationships created/updated.

**Rationale:**
- Neo4j driver provides accurate statistics via `result.summary().counters`
- Enables accurate reporting of sync results (not just file counts)
- Distinguishes between nodes created vs. updated (important for MERGE operations)
- Provides visibility into actual database changes, not just file processing counts

**Attribution:** User request to show Neo4j-reported statistics in sync history

**Implementation:**
- Added statistics fields to `PropertySyncItem`: `nodesCreated`, `nodesUpdated`, `propertiesSet`
- Added statistics fields to `RelationshipSyncItem`: `relationshipsCreated`, `relationshipsUpdated`, `targetNodesCreated`
- Updated `NodeSyncResult` and `RelationshipSyncResult` to include Neo4j statistics
- Created `extractCounterValue` helper to safely extract numeric values from Neo4j `Integer` objects (which have `toNumber()` method) or plain numbers
- Calculate `nodesUpdated` as `successCount - nodesCreated` (more accurate for MERGE operations than checking if properties were set)
- Statistics captured from batch query results and aggregated across batches

**Key Changes:**
- `nodeSync.ts`: Captures `nodesCreated` and `propertiesSet` from UNWIND batch queries, calculates `nodesUpdated` at end
- `relationshipSync.ts`: Captures `relationshipsCreated` from batch queries, calculates `relationshipsUpdated` as batch size minus created
- `MigrationResult` includes optional Neo4j statistics fields
- Statistics flow from sync operations → `MigrationResult` → `SyncItem` → history

### Configurable Batch Sizing

**Decision:** Add `syncBatchSize` setting that allows users to configure batch size manually or use automatic calculation.

**Rationale:**
- Different vault sizes and property counts benefit from different batch sizes
- Automatic calculation provides good defaults based on file count and property count
- Manual override allows fine-tuning for specific use cases or performance testing
- Batch size affects both performance and memory usage

**Attribution:** User decision to make batch sizing configurable for optimal performance

**Implementation:**
- Added `syncBatchSize?: number | "auto"` to `PluginSettings`
- Default value: `"auto"`
- `calculateBatchSize()` function in `SyncService/utils.ts`:
  - If `syncBatchSize` is a number, returns that value
  - If `"auto"`, calculates based on: `Math.min(1000, Math.max(100, Math.floor(totalFiles / 10)))`
  - Considers property count to avoid overly large batches with many properties
- Settings UI added dropdown for "Auto" vs "Manual", with number input for manual mode (1-10,000 range)

**Key Changes:**
- `PluginSettings` includes `syncBatchSize` field
- `calculateBatchSize()` used in both `nodeSync.ts` and `relationshipSync.ts`
- Settings tab includes "Sync settings" section with batch size configuration
- Batch size passed to sync operations via `settings` parameter

### UNWIND Batching for Performance

**Decision:** Implement UNWIND batching for both property sync and relationship sync operations to dramatically reduce query count.

**Rationale:**
- Original implementation executed individual queries per file/relationship
- For 1000 files with 5 relationships each: ~15,000 queries
- UNWIND batching reduces this to ~10-50 queries (depending on relationship type variety)
- Expected 5-10x performance improvement
- Neo4j is local, so network latency isn't the bottleneck - query count is

**Attribution:** User identified relationship syncs as slowest part, requested performance improvements

**Implementation:**

**Property Sync (nodeSync.ts):**
- Pre-process all files: extract front matter, convert values, build property maps
- Process files in batches using `UNWIND $batch AS item`
- Single query per batch: `MERGE (n:Note {path: item.path}) SET n.name = item.name SET n += item.properties`
- Captures `nodesCreated` and `propertiesSet` from batch query results
- Calculates `nodesUpdated` as `successCount - totalNodesCreated` at end

**Relationship Sync (relationshipSync.ts):**
- Pre-process all files: extract front matter, extract wikilink targets, build relationship data
- Process relationships in batches:
  1. **Batch target node creation**: Single UNWIND query to create all target nodes in batch
  2. **Batch source validation**: Single UNWIND query to check all source nodes exist
  3. **Batch relationship creation**: Group relationships by `(relationshipType, direction)` and execute separate UNWIND query per group (required because relationship types can't be parameterized in Cypher)
- Captures statistics from each batch query and aggregates

**Key Changes:**
- `nodeSync.ts`: Refactored to pre-process files, then batch with UNWIND
- `relationshipSync.ts`: Complete rewrite to pre-process, then batch all operations
- Both operations now process data in batches rather than per-file/per-relationship
- Error handling updated to mark entire batches as errors on failure
- Progress reporting updated to reflect relationship count rather than file count

**Performance Impact:**
- **Before**: ~3 queries per relationship (target node, source check, relationship)
- **After**: ~3 queries per batch (target nodes, source checks, relationships grouped by type)
- For 1000 files × 5 relationships: ~15,000 queries → ~10-50 queries
- Expected 5-10x speedup for relationship syncs

## Implementation Phases

### Phase 1: Type System Consolidation

- Removed `SyncQueueItem`, `BaseSyncHistoryEntry`, `PropertySyncHistoryEntry`, `RelationshipSyncHistoryEntry`, `SyncHistoryEntry`
- Created `SyncItemStatus` type and `BaseSyncItem` interface
- Created `PropertySyncItem`, `RelationshipSyncItem`, `FileSyncItem` interfaces
- Defined `SyncItem` as discriminated union
- Added type guard functions
- Updated `PluginSettings` and `SyncQueueState` to use `SyncItem`
- Updated `SyncQueueService` to use unified type throughout lifecycle
- Updated all UI components and services to use new type with type guards

### Phase 2: Neo4j Statistics Integration

- Added statistics fields to `PropertySyncItem` and `RelationshipSyncItem`
- Updated `NodeSyncResult` and `RelationshipSyncResult` to include statistics
- Created `extractCounterValue` helper for Neo4j Integer type handling
- Updated `nodeSync.ts` to capture statistics from batch queries
- Updated `relationshipSync.ts` to capture statistics from batch queries
- Updated `SyncService/index.ts` to pass statistics through to `MigrationResult`
- Updated `SyncQueueService` to populate statistics in `SyncItem` from results

### Phase 3: Configurable Batch Sizing

- Added `syncBatchSize` to `PluginSettings` with default `"auto"`
- Created `calculateBatchSize()` function in `SyncService/utils.ts`
- Updated `nodeSync.ts` and `relationshipSync.ts` to use `calculateBatchSize()`
- Added settings UI for batch size configuration (dropdown + number input)
- Updated `DEFAULT_SETTINGS` to include `syncBatchSize: "auto"`

### Phase 4: UNWIND Batching Implementation

**Property Sync:**
- Refactored `nodeSync.ts` to pre-process all files before database operations
- Implemented UNWIND batching for node MERGE operations
- Updated statistics capture from batch query results
- Updated error handling for batch failures

**Relationship Sync:**
- Complete refactor of `relationshipSync.ts` to pre-process all relationship data
- Implemented UNWIND batching for target node creation
- Implemented UNWIND batching for source node validation
- Implemented grouping by relationship type/direction for relationship creation
- Updated statistics capture and error handling for batch operations

## Key Technical Details

### Unified Type System

**SyncItem Lifecycle:**
```
queued → processing → completed/cancelled/error
```

**Properties Handling:**
- Queue: `Set<string>` for efficient deduplication
- History: `string[]` for JSON serialization
- Conversion happens in `SyncQueueService.moveToHistory()`

**Type Guards:**
```typescript
export function isPropertySyncItem(item: SyncItem): item is PropertySyncItem {
  return item.type === "property-sync"
}
```

### Neo4j Statistics

**Counter Extraction:**
```typescript
export function extractCounterValue(counter: unknown): number {
  if (counter === null || counter === undefined) return 0
  if (typeof counter === 'number') return counter
  if (typeof counter === 'object' && counter !== null && 'toNumber' in counter) {
    return (counter as { toNumber: () => number }).toNumber()
  }
  return 0
}
```

**Nodes Updated Calculation:**
- For MERGE operations, `nodesUpdated = successCount - nodesCreated`
- More accurate than checking if properties were set (which doesn't distinguish create vs update)

### Batch Size Calculation

**Auto Mode Formula:**
```typescript
Math.min(1000, Math.max(100, Math.floor(totalFiles / 10)))
```
- Minimum: 100
- Maximum: 1000
- Scales with file count

### UNWIND Batching Patterns

**Property Sync:**
```cypher
UNWIND $batch AS item
MERGE (n:Note {path: item.path})
SET n.name = item.name
SET n += item.properties
```

**Relationship Sync - Target Nodes:**
```cypher
UNWIND $batch AS item
MERGE (target:Note {path: item.targetPath})
ON CREATE SET target.name = item.targetName
```

**Relationship Sync - Relationships (grouped by type):**
```cypher
UNWIND $batch AS item
MATCH (source:Note {path: item.sourcePath})
MATCH (target:Note {path: item.targetPath})
MERGE (source)-[r:RELATIONSHIP_TYPE]->(target)
```

**Note:** Relationship types cannot be parameterized in Cypher, so separate queries are required for each `(relationshipType, direction)` combination.

## Future Considerations

### Potential Enhancements

- **Parallel file pre-processing**: Currently sequential; could parallelize file I/O for additional speedup
- **Multiple smaller transactions**: Commit every N batches instead of single large transaction (better memory usage, minimal impact for local Neo4j)
- **Remove redundant source node check**: If property sync runs first, source nodes already exist - could skip validation
- **Relationship type parameterization workaround**: Explore APOC procedures or other approaches to batch relationships of different types in single query

### Areas for Future Refactoring

- Consider extracting pre-processing logic to separate functions for better testability
- Evaluate if relationship grouping logic could be optimized further
- Consider caching relationship type/direction groups to avoid repeated grouping

### Known Limitations

- Relationship types must be grouped and batched separately (Cypher limitation)
- Pre-processing phase is sequential (file I/O bottleneck for very large vaults)
- Single transaction for entire sync (could be memory-intensive for very large batches)

## Conclusion

The type system consolidation successfully unified queue and history types, simplifying the codebase and enabling better state tracking throughout the sync lifecycle. Neo4j statistics integration provides accurate reporting of database changes. UNWIND batching delivers significant performance improvements, particularly for relationship syncs, reducing query count by orders of magnitude. The configurable batch sizing allows users to optimize for their specific vault characteristics. Together, these changes provide a more maintainable, performant, and user-configurable sync system.

