# Obsidian Plugin Template

A minimal, production-ready template for developing Obsidian plugins with TypeScript.

## Features

- ✨ **Minimal Setup** - Just the essentials to get started
- 🔧 **TypeScript** - Full type safety with Obsidian API
- 🎨 **CSS Bundling** - Automatically collects and bundles all CSS files from your project
- 🔄 **Hot Reload** - Auto-copy to vault on file changes during development
- 📦 **Production Build** - Optimized builds with tree-shaking and minification
- 🚀 **GitHub Actions** - Automated linting and releases with CI/CD
- ✅ **ESLint** - Modern ESLint v9+ with Obsidian-compliant rules
- 🔐 **Environment Variables** - Secure vault path management with `.env`

## Getting Started

### 1. Use This Template

Click the "Use this template" button on GitHub to create your own repository.

### 2. Clone Your Repository

```bash
git clone https://github.com/yourusername/your-plugin-name.git
cd your-plugin-name
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Your Plugin

Update the following files with your plugin information:

- `src/manifest.json` - Plugin ID, name, description, author
- `package.json` - Package name, description, author
- `LICENSE` - Your name and year

### 5. Set Up Development Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and set your vault plugin path:

```
VAULT_PLUGIN_PATH=/path/to/your/vault/.obsidian/plugins/your-plugin-id
```

**Example:**

```
VAULT_PLUGIN_PATH=/Users/username/Documents/MyVault/.obsidian/plugins/my-plugin
```

### 6. Start Development

```bash
npm run dev
```

This will:

- Watch for file changes
- Automatically compile and copy files to your vault
- Bundle all CSS files into a single `styles.css`

You'll need to reload Obsidian to see changes (Cmd/Ctrl + R).

### 7. Build for Production

For local testing in your vault:

```bash
npm run build
```

This creates optimized production files in your vault's plugin directory.

For packaging and releases (CI/CD):

```bash
npm run build:release
```

This creates optimized files in the `build/` directory without requiring `VAULT_PLUGIN_PATH`.

## Project Structure

```
.
├── src/
│   ├── main.ts          # Main plugin entry point
│   ├── manifest.json    # Plugin manifest
│   ├── types.ts         # Custom types and interfaces
│   └── styles.css       # Optional: main styles (auto-bundled)
├── build/               # Release build output (gitignored)
├── .env                 # Environment variables (create from .env.example)
├── .env.example         # Example environment configuration
├── eslint.config.mjs    # ESLint configuration (flat config)
├── .gitignore           # Git ignore rules
├── .cursorignore        # Cursor ignore rules
├── esbuild.config.mjs   # Build configuration
├── package.json         # Package dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── version-bump.mjs     # Version management script
└── versions.json        # Version compatibility tracking
```

## CSS Bundling

The template includes automatic CSS bundling. Any `.css` files in your `src/` directory will be automatically collected and bundled into a single `styles.css` file in your vault's plugin directory.

**Example:**

```
src/
├── components/
│   ├── button.css
│   └── modal.css
└── views/
    └── sidebar.css
```

All these files will be bundled into a single `styles.css` with source comments for easy debugging.

## GitHub Actions (CI/CD)

This template includes automated workflows:

### Lint Workflow

Runs on every push and pull request to the `main` branch:
- ✅ Runs ESLint to check code quality
- ✅ Runs TypeScript type checking
- ✅ Ensures code meets Obsidian plugin standards

The workflow must pass before merging PRs.

### Release Workflow

Triggers when you push a git tag (e.g., `1.0.0`):
- ✅ Installs dependencies
- ✅ Builds the plugin with `npm run build:release`
- ✅ Creates a GitHub release
- ✅ Attaches `main.js`, `manifest.json`, and `styles.css`
- ✅ Generates release notes automatically

No manual building or file uploads required!

## Version Management

To release a new version:

1. Update the version in `package.json`
2. Run `npm run version` to sync `manifest.json` and `versions.json`
3. Commit the changes
4. Create a git tag: `git tag -a 1.0.0 -m "Release 1.0.0"`
5. Push the tag: `git push origin 1.0.0`

The GitHub Action will automatically create a release with the built files.

## Publishing Your Plugin

### Automated Release (Recommended)

When you push a git tag, the GitHub Action automatically:

- Builds the plugin
- Creates a GitHub release
- Attaches `main.js`, `manifest.json`, and `styles.css`

### Manual Release

1. Run `npm run build:release`
2. Copy these files from the `build/` directory:
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. Create a release on GitHub and attach these files

### Submit to Community Plugins

Follow the [official Obsidian plugin submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## Development Tips

### Enable Hot Reload in Obsidian

Install the [Hot-Reload plugin](https://github.com/pjeby/hot-reload) for automatic plugin reloading during development.

### Debugging

Use the Developer Console (Cmd/Ctrl + Shift + I) to view console logs and errors.

### Linting

The template uses ESLint v9+ with flat config format for code quality:

```bash
# Check for linting errors
npm run lint

# Automatically fix linting errors
npm run lint:fix

# Type check without building
npm run typecheck
```

The linting configuration (`eslint.config.mjs`) matches Obsidian's plugin submission requirements.

### Pre-commit Hooks

The template uses Husky and lint-staged to automatically lint your code before commits:

- **Automatic Setup**: Git hooks are installed automatically when you run `npm install`
- **Fast Linting**: Only lints staged files (not the entire codebase)
- **Auto-fix**: Automatically fixes linting errors when possible
- **Prevents Bad Commits**: Stops commits with unfixable linting errors

This ensures code quality and prevents CI failures due to linting issues.

### TypeScript Path Aliases

The template includes a `@/*` path alias pointing to `src/*`:

```typescript
// Instead of
import { MyClass } from "../../utils/myClass"

// You can write
import { MyClass } from "@/utils/myClass"
```

## Resources

- [Obsidian API Documentation](https://docs.obsidian.md/Home)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API on GitHub](https://github.com/obsidianmd/obsidian-api)
- [Community Plugins](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json)

## License

MIT License - see [LICENSE](LICENSE) file for details.
