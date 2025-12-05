# Obsidian GraphDB Sync

Sync your Obsidian vault to a Neo4j graph database, transforming your notes into queryable graph nodes with relationships.

## Status

✅ **Phase 1: Migration** - Batch migration from vault to Neo4j is fully implemented and functional.

## Supported Databases

| Database | Status | Notes |
|----------|--------|-------|
| Neo4j | ✅ Supported | Primary implementation |

## Features

### Current Capabilities

- **Full vault migration** - Batch migration of all markdown files to Neo4j
- **Connection management** - Configure Neo4j URI, username, and password in settings
- **Session password storage** - Secure in-memory password storage (cleared on Obsidian close)
- **Connection testing** - Automatic connection validation with real-time status
- **Migration monitoring** - Status view with progress tracking and results
- **Migration controls** - Start, pause, resume, and cancel migrations
- **Status bar integration** - Quick access to migration status and controls
- **Last migration results** - Persistent storage of migration statistics and errors

### Planned Capabilities

- **Intelligent relationship mapping** - Convert wikilinks to typed graph relationships
- **Entity resolution** - Create placeholder nodes for unresolved wikilink targets
- **File type strategies** - Custom handling for Occurrences, People, Places, Topics, etc.
- **Content hash tracking** - Detect changes for incremental updates
- **Incremental sync** - Only sync changed files
- **Real-time file watchers** - Auto-sync on file changes

### Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Batch migration via commands | ✅ Complete |
| Phase 1.5 | Relationship mapping and entity resolution | ⏳ Planned |
| Phase 2 | Real-time file watchers for auto-sync | ⏳ Planned |

## Installation

### Prerequisites

- Graph database instance (Neo4j recommended)
- Obsidian v0.15.0 or higher

### Neo4j Setup

1. Install [Neo4j Desktop](https://neo4j.com/download/) or use [Neo4j Aura](https://neo4j.com/cloud/aura/) (cloud)
2. Create a new database and note your connection credentials
3. Configure the plugin with your connection details

### From Source

1. Clone this repository to your vault's `.obsidian/plugins/` directory
2. Run `npm install`
3. Run `npm run build`
4. Enable the plugin in Obsidian settings

## Configuration

### Neo4j Connection Settings

Configure your Neo4j connection in Obsidian Settings → GraphDB Sync:

1. **Neo4j URI** - Connection URI (e.g., `neo4j://localhost:7687`)
2. **Username** - Neo4j username (default: `neo4j`)
3. **Password** - Session password (stored in memory, cleared when Obsidian closes)

The plugin automatically tests the connection when settings change. Connection status is displayed in real-time.

### Standalone Migration Script

For command-line migration, use the standalone script:

```bash
# Set environment variables
export VAULT_PATH=/path/to/your/vault
export NEO4J_URI=neo4j://localhost:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD=your-password

# Run migration
npm run migrate
```

Or use a `.env` file (see `.env.example` for format).

## Development

### Setup

```bash
git clone https://github.com/jprowan/obsidian-graphdb-sync.git
cd obsidian-graphdb-sync
npm install
cp .env.example .env
# Edit .env with your vault path
npm run dev
```

### Building

```bash
npm run build        # Build to vault
npm run build:release # Build for distribution
```

## Usage

### Starting a Migration

1. Open the **GraphDB Sync Status** view (Command Palette → "Open sync status" or click status bar icon)
2. Ensure connection status shows "Ready to migrate"
3. Click **Start migration**
4. Monitor progress in the status view
5. View results and any errors after completion

### Status Bar

The status bar icon provides quick access to:
- Connection status
- Migration progress
- Migration controls (start, pause, resume, cancel)
- Navigation to settings and status view

Icon colors indicate state:
- **Normal** - Ready or idle
- **Warning (animated)** - Migration in progress
- **Error** - Connection error or migration failure

### Commands

- **Open sync status** - Opens the migration status view
- **Start migration** - Starts a new migration (opens status view if not already open)

## Architecture

The plugin uses a component-based architecture with centralized state management:

```
src/
├── main.ts                  # Plugin entry point
├── types.ts                 # TypeScript interfaces
├── settingsTab.ts          # Settings UI
├── styles.css              # Shared styles
├── services/                # Business logic
│   ├── CredentialService.ts    # Session password management
│   ├── Neo4jService.ts          # Neo4j connection testing
│   ├── MigrationService.ts      # Migration execution
│   └── StateService.ts          # Centralized state management
├── statusBar/               # Status bar component
│   ├── StatusBarService.ts
│   └── styles.css
├── statusView/             # Status view component
│   ├── StatusView.ts
│   └── styles.css
└── utils/                   # Shared utilities
    └── obsidianApi.ts       # Obsidian API helpers
```

### State Management

The plugin uses an event-driven state management pattern:
- `StateService` centralizes all plugin state (connection, migration, readiness)
- Components subscribe to state change events
- Automatic UI updates when state changes
- Debounced connection testing prevents excessive API calls

## License

MIT License - see [LICENSE](LICENSE) for details.
