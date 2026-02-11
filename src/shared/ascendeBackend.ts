/**
 * Ascende Eigent backend configuration.
 * Used when extension connects to Ascende-hosted Eigent backend.
 */
import * as vscode from "vscode"

const ASCENDE_BACKEND_URL_KEY = "roo-cline.ascendeBackendUrl"
const ASCENDE_USE_EIGENT_ENGINE_KEY = "roo-cline.ascendeUseEigentEngine"
const ASCENDE_API_KEY_SECRET_KEY = "ascendeBackendApiKey"

/** Default backend URL for local development. */
export const DEFAULT_ASCENDE_BACKEND_URL = "http://localhost:8000"

/**
 * Get the Ascende backend base URL from settings.
 * Falls back to localhost:8000 for dev.
 */
export function getAscendeBackendUrl(): string {
	return vscode.workspace.getConfiguration().get<string>(ASCENDE_BACKEND_URL_KEY) ?? DEFAULT_ASCENDE_BACKEND_URL
}

/**
 * Whether to use Eigent Engine (Ascende backend) instead of Cline.
 */
export function getAscendeUseEigentEngine(): boolean {
	return vscode.workspace.getConfiguration().get<boolean>(ASCENDE_USE_EIGENT_ENGINE_KEY) ?? false
}

/**
 * Store Ascende API key in extension secrets.
 */
export async function setAscendeApiKey(context: vscode.ExtensionContext, apiKey: string): Promise<void> {
	await context.secrets.store(ASCENDE_API_KEY_SECRET_KEY, apiKey)
}

/**
 * Get Ascende API key from extension secrets.
 */
export async function getAscendeApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	return context.secrets.get(ASCENDE_API_KEY_SECRET_KEY)
}

/**
 * Clear Ascende API key from extension secrets.
 */
export async function clearAscendeApiKey(context: vscode.ExtensionContext): Promise<void> {
	await context.secrets.delete(ASCENDE_API_KEY_SECRET_KEY)
}
