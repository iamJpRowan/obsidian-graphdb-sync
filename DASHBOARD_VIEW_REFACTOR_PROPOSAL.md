# DashboardView.ts Refactoring Proposal

## Current State

- **File**: `src/dashboardView/DashboardView.ts`
- **Lines**: ~1,288 lines
- **Guideline**: Files should be under 300 lines
- **Status**: Exceeds guideline by ~4x

## Proposed File Structure

### Option 1: Component-Based Extraction (Recommended)

Break down `DashboardView.ts` into focused components and services:

```
src/dashboardView/
├── DashboardView.ts                    # Main view class (~200 lines)
│   ├── Tab management
│   ├── View lifecycle (onOpen, onClose, render)
│   └── High-level orchestration
│
├── components/
│   ├── MigrationTab.ts                 # Migration tab UI (~250 lines)
│   │   ├── Status display
│   │   ├── Progress display
│   │   ├── Results display
│   │   └── Controls
│   │
│   ├── ConfigurationTab.ts             # Configuration tab UI (~150 lines)
│   │   ├── Analysis header
│   │   ├── Analysis stats
│   │   └── Property cards container
│   │
│   └── PropertyCard.ts                 # Property card component (~400 lines)
│       ├── Card header (metadata, name, toggle)
│       ├── Card body (configuration form, samples)
│       ├── State management (mapping, toggle, fields)
│       └── Event handlers
│
├── services/
│   └── PropertyMappingService.ts       # Property mapping state management (~150 lines)
│       ├── Save logic (unified immediate/debounced)
│       ├── State synchronization
│       └── Config creation helpers
│
└── helpers/
    ├── formHelpers.ts                  # Form components (existing)
    ├── configHelpers.ts                # Config creation (existing)
    ├── propertyTypeHelpers.ts          # Type icons (existing)
    └── columnHelpers.ts                # Sample columns (existing)
```

### Option 2: Feature-Based Extraction

Group by feature area:

```
src/dashboardView/
├── DashboardView.ts                    # Main view class (~200 lines)
│
├── migration/
│   ├── MigrationTab.ts                # Migration tab (~300 lines)
│   ├── MigrationStatus.ts             # Status display (~100 lines)
│   ├── MigrationProgress.ts           # Progress display (~100 lines)
│   ├── MigrationResults.ts            # Results display (~150 lines)
│   └── MigrationControls.ts           # Controls (~100 lines)
│
├── configuration/
│   ├── ConfigurationTab.ts            # Configuration tab (~200 lines)
│   ├── PropertyCard.ts                # Property card (~400 lines)
│   └── PropertyMappingManager.ts      # Mapping state management (~200 lines)
│
└── helpers/                            # (existing structure)
```

### Option 3: Hybrid Approach (Balanced)

Combine component extraction with feature grouping:

```
src/dashboardView/
├── DashboardView.ts                    # Main view (~200 lines)
│   ├── Tab management
│   └── View lifecycle
│
├── tabs/
│   ├── MigrationTab.ts                # Migration tab (~300 lines)
│   └── ConfigurationTab.ts            # Configuration tab (~200 lines)
│
├── components/
│   └── PropertyCard.ts                # Property card (~400 lines)
│       ├── Card rendering
│       ├── State management
│       └── Event handlers
│
├── services/
│   └── PropertyMappingService.ts       # Mapping state (~150 lines)
│
└── helpers/                            # (existing structure)
```

## Recommendation: Option 1 (Component-Based)

**Rationale:**
- Clear separation of concerns
- Each component has single responsibility
- Easier to test individual components
- Better aligns with React-like component patterns
- Maintains existing helper structure

## Implementation Strategy

### Phase 1: Extract Property Card
1. Create `PropertyCard.ts` component class
2. Move property card rendering logic (~400 lines)
3. Pass necessary dependencies (plugin, prop, callbacks)
4. Update `DashboardView` to use component

### Phase 2: Extract Tab Components
1. Create `MigrationTab.ts` and `ConfigurationTab.ts`
2. Move tab-specific rendering logic
3. Keep state management in main view or move to services

### Phase 3: Extract State Management
1. Create `PropertyMappingService.ts`
2. Move save logic, state synchronization
3. Centralize config creation (already done via `configHelpers.ts`)

### Phase 4: Cleanup
1. Remove duplicate code
2. Ensure proper event cleanup
3. Update imports and exports

## Benefits

1. **Maintainability**: Smaller, focused files are easier to understand and modify
2. **Testability**: Components can be tested in isolation
3. **Reusability**: Components can be reused if needed
4. **Readability**: Clear file structure makes navigation easier
5. **Collaboration**: Multiple developers can work on different components

## Considerations

- **State Management**: Need to decide where state lives (component vs service vs view)
- **Event Cleanup**: Ensure all event listeners are properly cleaned up
- **Type Safety**: Maintain strong typing across component boundaries
- **Performance**: Ensure component extraction doesn't impact performance

## Migration Path

1. Start with `PropertyCard` extraction (biggest win)
2. Test thoroughly before proceeding
3. Extract tabs incrementally
4. Extract services last (most refactoring needed)

