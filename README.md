# Obsidian GraphDB Sync

Sync your Obsidian vault to a graph database, transforming your notes into a queryable knowledge graph with typed relationships.

## Status

🚧 **Phase 1: Migration** - Currently implementing batch migration from vault to graph database.

## Supported Databases

| Database | Status | Notes |
|----------|--------|-------|
| Neo4j | ✅ Supported | Primary implementation |

## Features

### Planned Capabilities

- **Full vault migration** - Load all files as nodes with frontmatter properties
- **Intelligent relationship mapping** - Convert wikilinks to typed graph relationships
- **Entity resolution** - Create placeholder nodes for unresolved wikilink targets
- **File type strategies** - Custom handling for Occurrences, People, Places, Topics, etc.
- **Content hash tracking** - Detect changes for incremental updates
- **Database abstraction** - Pluggable graph database backend

### Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Batch migration via commands | 🔄 In Progress |
| Phase 1.5 | Manual sync commands in Obsidian | ⏳ Planned |
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

*Configuration options will be documented as they are implemented.*

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

## Architecture

The plugin uses an abstracted graph service layer, allowing different graph database implementations while maintaining a consistent internal API.

```
src/
├── core/                    # Shared business logic
│   ├── graph-service        # GraphService interface
│   │   ├── index.ts
│   │   └── neo4j-service.ts # Neo4j implementation
│   ├── parser.ts            # Frontmatter/wikilink parsing
│   ├── types.ts             # TypeScript interfaces
│   └── vault-scanner.ts     # Vault traversal logic
├── commands/                # Obsidian command handlers
├── watchers/                # Real-time sync (Phase 2)
└── main.ts                  # Plugin entry point
```

## License

MIT License - see [LICENSE](LICENSE) for details.
