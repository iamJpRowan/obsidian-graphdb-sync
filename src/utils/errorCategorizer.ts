import type { ErrorType } from "../types"

/**
 * Categorizes Neo4j errors based on error messages and codes
 * Returns UNKNOWN for unclassified errors - can be expanded as more error types surface
 */
export function categorizeError(error: unknown): ErrorType {
	const errorMessage = error instanceof Error ? error.message : String(error)
	const errorString = errorMessage.toLowerCase()

	// Network/connection errors
	if (
		errorString.includes("connection") ||
		errorString.includes("network") ||
		errorString.includes("timeout") ||
		errorString.includes("econnrefused") ||
		errorString.includes("econnreset")
	) {
		return "NETWORK"
	}

	// Transaction errors
	if (
		errorString.includes("transaction") ||
		errorString.includes("rollback") ||
		errorString.includes("commit")
	) {
		return "TRANSACTION"
	}

	// Node not found errors (source node missing)
	if (
		errorString.includes("node not found") ||
		errorString.includes("no node found") ||
		errorString.includes("expected a node")
	) {
		return "SOURCE_NODE_MISSING"
	}

	// Target node creation failures
	if (
		errorString.includes("failed to create") ||
		errorString.includes("cannot create node") ||
		errorString.includes("node creation failed")
	) {
		return "TARGET_NODE_FAILURE"
	}

	// Validation errors
	if (
		errorString.includes("invalid") ||
		errorString.includes("validation") ||
		errorString.includes("malformed") ||
		errorString.includes("format")
	) {
		return "VALIDATION"
	}

	// Type errors
	if (
		errorString.includes("type") ||
		errorString.includes("cannot convert") ||
		errorString.includes("type mismatch")
	) {
		return "INVALID_TYPE"
	}

	// Query execution errors (catch-all for Neo4j query errors)
	if (
		errorString.includes("syntax error") ||
		errorString.includes("cypher") ||
		errorString.includes("query") ||
		errorString.includes("neo4j")
	) {
		return "QUERY_EXECUTION"
	}

	// Default to unknown for unclassified errors
	return "UNKNOWN"
}


