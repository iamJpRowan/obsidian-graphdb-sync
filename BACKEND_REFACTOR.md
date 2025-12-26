# Backend Architecture Refactor

## Overview

This document describes the backend refactor that separates concerns and creates a clean service-oriented architecture. The refactor focuses on making the codebase more maintainable, testable, and ready for a clean UI rebuild.

## New Services

### 1. PropertyMappingService
**Location:** `src/services/PropertyMappingService.ts`

Centralizes all property mapping CRUD operations.

**Key Methods:**
- `getMappings()` - Get all mappings
- `getMapping()` - Get single mapping
- `saveMapping()` - Save mapping with validation
- `deleteMapping()` - Delete mapping
- `validateMapping()` - Validate mapping configuration
- `getEnabledMappings()` - Get all enabled mappings
- `isMapped()` - Check if property is mapped
- `isEnabled()` - Check if mapping is enabled

**Benefits:**
- Single source of truth for mapping operations
- Validation before save
- No UI logic in mapping management

### 2. PropertyValidationService
**Location:** `src/services/PropertyValidationService.ts`

Provides on-demand validation of properties.

**Key Methods:**
- `validateProperty()` - Validate single property
- `validateEnabledProperties()` - Validate all enabled properties
- `getFilesWithIssues()` - Get files with validation issues
- `createValidationSummary()` - Create summary for multiple properties

**Benefits:**
- Validation on-demand (not during analysis)
- Clear issue types and severity
- Easy to query files with issues

### 3. PropertyQueryService
**Location:** `src/services/PropertyQueryService.ts`

Unified query interface for property state and metadata.

**Key Methods:**
- `getPropertyState()` - Get complete state for a property
- `getAllPropertyStates()` - Get all property states
- `filterProperties()` - Filter by criteria
- `getStatistics()` - Get property statistics
- `sortProperties()` - Sort properties

**Benefits:**
- Single query interface for property state
- UI can filter/search without business logic
- Statistics computed from state
- Easy to extend with new filters

### 4. SettingsService
**Location:** `src/services/SettingsService.ts`

Centralizes settings operations.

**Key Methods:**
- `getNodeLabelConfig()` - Get node label configuration
- `updateNodeLabelConfig()` - Update node label configuration
- `updateConnectionSettings()` - Update connection settings
- `ensurePassword()` - Ensure password is available, prompting if needed

**Benefits:**
- Centralized settings management
- Password prompt helper
- Ready for node label configuration

## Refactored Services

### VaultAnalysisService
**Changes:**
- Made analysis on-demand (not auto-triggered)
- Added `isAnalysisStale()` - Check if analysis is stale
- Added `getFreshAnalysis()` - Get analysis if fresh

**Benefits:**
- Analysis only runs when needed
- Simple time-based caching (24 hours default)
- UI can check if analysis needs refresh

### StateService
**Changes:**
- Kept subscription system (useful for reactive UI)
- Added helper methods:
  - `getConnectionStatus()` - Get connection status
  - `getMigrationStatus()` - Get migration status
  - `canStartMigration()` - Check if migration can start

**Benefits:**
- More queryable interface
- Clear helper methods for common checks
- Maintains reactive capabilities

### MigrationService
**Changes:**
- Updated to use `PropertyMappingService` for getting enabled mappings
- Simplified property stats initialization

**Benefits:**
- Uses centralized service
- Less direct access to settings

## New Types

Added to `src/types.ts`:

- `NodeLabelConfig` - Configuration for node labels (tags/folders)
- `ValidationIssueType` - Types of validation issues
- `ValidationIssueSeverity` - Error or warning
- `ValidationIssue` - Validation issue details
- `FileIssue` - Specific file with validation problem
- `PropertyValidationResult` - Validation result for a property
- `ValidationSummary` - Summary for multiple properties
- `PropertyState` - Complete state for UI
- `PropertyFilter` - Filter criteria
- `PropertyStatistics` - Property statistics
- `MappingValidationResult` - Mapping validation result

## Architecture Principles

1. **Separation of Concerns:** Data, business logic, and UI are separated
2. **Service-Oriented:** Single-responsibility services
3. **Queryable State:** Access current state without complex subscriptions
4. **On-Demand Operations:** Validation and analysis when needed
5. **Simple First:** Start with simplest approach, add complexity only as needed

## Data Flow

```
UI Layer
  ↓ (queries & commands)
Query Services (PropertyQueryService, StateService)
  ↓ (uses)
Business Logic Services (PropertyMappingService, PropertyValidationService, MigrationService)
  ↓ (reads/writes)
Data Layer (PluginSettings, CredentialService, Neo4jService)
```

## Migration Path

✅ **Phase 1: Create new services** (COMPLETED)
- PropertyMappingService
- PropertyValidationService
- PropertyQueryService
- SettingsService

✅ **Phase 2: Refactor existing services** (COMPLETED)
- VaultAnalysisService (on-demand)
- StateService (helper methods)
- MigrationService (use new services)

⏳ **Phase 3: Update UI to use new services** (NEXT)
- Build new PropertyItem component
- Rebuild DashboardView using new services
- Remove old PropertyCard and tab components

⏳ **Phase 4: Cleanup** (FUTURE)
- Remove deprecated code
- Remove settingsTab.ts
- Consolidate helper functions

## Next Steps

1. Build new UI components using the new services
2. Create PropertyItem component from scratch
3. Rebuild DashboardView as unified interface
4. Remove old components (PropertyCard, ConfigurationTab, MigrationTab)
5. Remove settingsTab.ts

## Benefits

- **Testability:** Services are pure functions or have clear dependencies
- **Maintainability:** Single responsibility per service
- **Flexibility:** UI can query what it needs without tight coupling
- **Performance:** On-demand validation and analysis
- **Extensibility:** Easy to add new query methods or validation rules


