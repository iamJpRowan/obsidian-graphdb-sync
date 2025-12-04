/**
 * Service for managing Neo4j credentials
 * Password is stored in memory for the current session only (cleared on plugin unload).
 */
export class CredentialService {
	// Session-only password storage (cleared on plugin unload)
	private static sessionPassword: string | null = null

	/**
	 * Gets password from session storage
	 * @returns Password if available, null otherwise
	 */
	static getPassword(): string | null {
		return this.sessionPassword
	}

	/**
	 * Stores password in memory for the current session
	 * @param password - Password to store in memory
	 */
	static setSessionPassword(password: string): void {
		this.sessionPassword = password
	}

	/**
	 * Clears the session password from memory
	 * Called automatically on plugin unload
	 */
	static clearSessionPassword(): void {
		this.sessionPassword = null
	}

	/**
	 * Checks if password is available in session
	 * @returns True if password is available
	 */
	static hasPassword(): boolean {
		return this.sessionPassword !== null
	}
}

