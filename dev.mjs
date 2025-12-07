import { spawn } from "child_process"
import { watch } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

// Parse command line arguments
const args = process.argv.slice(2)
const isVerbose = args.includes("--verbose") || args.includes("-v")

// State tracking
const state = {
  tsc: {
    errors: 0,
    warnings: 0,
    lastFile: null,
    lastUpdate: null,
    hasErrors: false,
  },
  eslint: {
    errors: 0,
    warnings: 0,
    lastFile: null,
    lastUpdate: null,
    hasErrors: false,
  },
  esbuild: {
    status: "initializing",
    lastFile: null,
    lastUpdate: null,
    hasErrors: false,
  },
}

// Track if we should update the status line
let statusLineInitialized = false

/**
 * Format timestamp for display
 */
function formatTime() {
  return new Date().toLocaleTimeString()
}

/**
 * Clear the status line and print a new one
 */
function updateStatusLine() {
  if (isVerbose) return // Don't update status line in verbose mode

  const tscStatus = state.tsc.hasErrors
    ? `❌ ${state.tsc.errors} error${state.tsc.errors !== 1 ? "s" : ""}`
    : state.tsc.warnings > 0
      ? `⚠️  ${state.tsc.warnings} warning${state.tsc.warnings !== 1 ? "s" : ""}`
      : "✅ OK"

  const eslintStatus = state.eslint.hasErrors
    ? `❌ ${state.eslint.errors} error${state.eslint.errors !== 1 ? "s" : ""}`
    : state.eslint.warnings > 0
      ? `⚠️  ${state.eslint.warnings} warning${state.eslint.warnings !== 1 ? "s" : ""}`
      : "✅ OK"

  const esbuildStatus = state.esbuild.hasErrors
    ? "❌ Build failed"
    : state.esbuild.status === "building"
      ? "⏳ Building..."
      : state.esbuild.status === "success"
        ? "✅ Built"
        : state.esbuild.status

  const lastFile =
    state.tsc.lastFile || state.eslint.lastFile || state.esbuild.lastFile || "—"

  const lastUpdate =
    state.tsc.lastUpdate || state.eslint.lastUpdate || state.esbuild.lastUpdate || formatTime()

  const statusLine = `\r[${formatTime()}] TSC: ${tscStatus} | ESLint: ${eslintStatus} | esbuild: ${esbuildStatus} | Last: ${lastFile}${lastUpdate ? ` (${lastUpdate})` : ""}     `

  process.stdout.write(statusLine)
  statusLineInitialized = true
}

/**
 * Parse TypeScript watch output
 */
function parseTscOutput(data) {
  const output = data.toString()
  const lines = output.split("\n").filter((line) => line.trim())

  for (const line of lines) {
    // TypeScript watch mode outputs:
    // - "Found X errors. Watching for file changes."
    // - "error TSXXXX: ..." for each error
    // - "File change detected. Starting incremental compilation..."
    // - "Found 0 errors. Watching for file changes."

    if (line.includes("Found")) {
      const errorMatch = line.match(/Found (\d+) error/)
      const warningMatch = line.match(/(\d+) warning/)
      if (errorMatch) {
        state.tsc.errors = parseInt(errorMatch[1], 10)
        state.tsc.hasErrors = state.tsc.errors > 0
        state.tsc.lastUpdate = formatTime()
      }
      if (warningMatch) {
        state.tsc.warnings = parseInt(warningMatch[1], 10)
      }
    }

    // Extract file name from error lines (format: "src/file.ts(1,2): error TS...")
    const fileMatch = line.match(/^([^(]+)\(/)
    if (fileMatch) {
      state.tsc.lastFile = path.relative(process.cwd(), fileMatch[1])
    }

    if (line.includes("File change detected")) {
      state.tsc.lastUpdate = formatTime()
    }
  }

  if (!isVerbose) {
    updateStatusLine()
  }
}

/**
 * Parse ESLint JSON output
 */
function parseEslintOutput(data) {
  try {
    const output = data.toString().trim()
    if (!output) return

    // ESLint JSON format: array of file results
    const results = JSON.parse(output)

    let totalErrors = 0
    let totalWarnings = 0
    let lastFile = null

    for (const result of results) {
      if (result.errorCount > 0 || result.warningCount > 0) {
        totalErrors += result.errorCount
        totalWarnings += result.warningCount
        if (!lastFile && result.filePath) {
          lastFile = path.relative(process.cwd(), result.filePath)
        }
      }
    }

    state.eslint.errors = totalErrors
    state.eslint.warnings = totalWarnings
    state.eslint.hasErrors = totalErrors > 0
    state.eslint.lastFile = lastFile || state.eslint.lastFile
    state.eslint.lastUpdate = formatTime()

    if (!isVerbose) {
      updateStatusLine()
    }
  } catch (error) {
    // If JSON parsing fails, it might be a non-JSON error message
    // In quiet mode, we'll just skip it
    if (isVerbose) {
      process.stdout.write(data)
    }
  }
}

/**
 * Parse esbuild output
 */
function parseEsbuildOutput(data) {
  const output = data.toString()
  if (!output.trim()) return

  const lines = output.split("\n").filter((line) => line.trim())

  for (const line of lines) {
    if (line.toLowerCase().includes("error")) {
      state.esbuild.hasErrors = true
      state.esbuild.status = "error"
      // Try to extract file name from error
      const fileMatch = line.match(/([^\s]+\.ts)/)
      if (fileMatch) {
        state.esbuild.lastFile = path.relative(process.cwd(), fileMatch[1])
      }
    } else if (line.toLowerCase().includes("built") || line.toLowerCase().includes("success")) {
      state.esbuild.status = "success"
      state.esbuild.hasErrors = false
    } else if (line.toLowerCase().includes("building") || line.toLowerCase().includes("bundling")) {
      state.esbuild.status = "building"
    }

    // Extract file names from various esbuild messages
    const fileMatch = line.match(/(src\/[^\s]+)/)
    if (fileMatch) {
      state.esbuild.lastFile = path.relative(process.cwd(), fileMatch[1])
    }

    state.esbuild.lastUpdate = formatTime()
  }

  if (!isVerbose) {
    updateStatusLine()
  }
}

/**
 * Run ESLint on a file or all files
 */
function runEslint(filePath = null) {
  const args = ["."]
  if (filePath) {
    args[0] = filePath
  }
  args.push("--format", "json")

  const eslintProcess = spawn("npx", ["eslint", ...args], {
    cwd: process.cwd(),
    stdio: isVerbose ? "inherit" : ["ignore", "pipe", "pipe"],
  })

  let eslintOutput = ""
  if (!isVerbose) {
    eslintProcess.stdout.on("data", (data) => {
      eslintOutput += data.toString()
    })
    eslintProcess.stderr.on("data", (data) => {
      // ESLint outputs JSON to stdout, but errors might go to stderr
      eslintOutput += data.toString()
    })
  }

  eslintProcess.on("close", (code) => {
    if (!isVerbose && eslintOutput) {
      parseEslintOutput(eslintOutput)
    }
    if (code !== 0 && code !== 1) {
      // Code 1 means linting errors found (expected), other codes are actual errors
      if (isVerbose) {
        console.error(`ESLint process exited with code ${code}`)
      }
    }
  })
}

// Spawn TypeScript compiler in watch mode
const tscProcess = spawn(
  "npx",
  ["tsc", "--watch", "--noEmit", "--skipLibCheck"],
  {
    cwd: process.cwd(),
    stdio: isVerbose ? "inherit" : ["ignore", "pipe", "pipe"],
  }
)

if (!isVerbose) {
  tscProcess.stdout.on("data", parseTscOutput)
  tscProcess.stderr.on("data", parseTscOutput) // TypeScript outputs to stderr
}

// Spawn esbuild in watch mode (with quiet mode if not verbose)
const esbuildProcess = spawn("node", ["esbuild.config.mjs"], {
  cwd: process.cwd(),
  stdio: isVerbose ? "inherit" : ["ignore", "pipe", "pipe"],
  env: { ...process.env, QUIET: !isVerbose ? "true" : undefined },
})

if (!isVerbose) {
  // In quiet mode, esbuild won't output much, so we'll track build status differently
  // We'll assume success if no errors are reported
  esbuildProcess.stdout.on("data", parseEsbuildOutput)
  esbuildProcess.stderr.on("data", parseEsbuildOutput)
  
  // Set initial esbuild status
  setTimeout(() => {
    if (state.esbuild.status === "initializing") {
      state.esbuild.status = "success"
      state.esbuild.lastUpdate = formatTime()
      updateStatusLine()
    }
  }, 3000)
}

// Set up file watcher for ESLint (since it doesn't have watch mode)
// Watch for .ts file changes in src directory
let eslintTimeout = null
const eslintWatcher = watch(
  "src",
  { recursive: true },
  (eventType, filename) => {
    if (filename && filename.endsWith(".ts")) {
      // Debounce ESLint runs to avoid running too frequently
      if (eslintTimeout) {
        clearTimeout(eslintTimeout)
      }
      eslintTimeout = setTimeout(() => {
        const filePath = path.join("src", filename)
        runEslint(filePath)
      }, 500)
    }
  }
)

// Run ESLint initially on all files after a short delay
setTimeout(() => {
  runEslint()
}, 2000) // Give TypeScript a moment to start

// Initial status line
if (!isVerbose) {
  console.log("Starting development watch mode...")
  console.log("Press Ctrl+C to stop\n")
  updateStatusLine()
}

// Handle cleanup
function cleanup() {
  if (statusLineInitialized && !isVerbose) {
    process.stdout.write("\n") // New line after status line
  }

  if (eslintTimeout) {
    clearTimeout(eslintTimeout)
  }

  tscProcess.kill()
  esbuildProcess.kill()
  eslintWatcher.close()

  if (isVerbose) {
    console.log("\nStopping watch processes...")
  }

  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

// Handle process errors
tscProcess.on("error", (error) => {
  console.error("TypeScript process error:", error)
  cleanup()
})

esbuildProcess.on("error", (error) => {
  console.error("esbuild process error:", error)
  cleanup()
})

