/**
 * Builds ChatParams for Eigent backend from provider state.
 */
import * as crypto from "crypto"

import type { ApiConfiguration } from "../../shared/api"
import type { ChatParams } from "../../services/eigent/types"
import { buildApiHandler } from "../../api"
import { getWorkspacePath } from "../../utils/path"

function getApiKey(config: ApiConfiguration): string {
	const p = config.apiProvider
	if (p === "openrouter" && config.openRouterApiKey) return config.openRouterApiKey
	if (p === "openai" && config.openAiApiKey) return config.openAiApiKey
	if (p === "anthropic" && config.apiKey) return config.apiKey
	if (config.openAiApiKey) return config.openAiApiKey
	if (config.openRouterApiKey) return config.openRouterApiKey
	if (config.apiKey) return config.apiKey
	return "not-provided"
}

function getApiUrl(config: ApiConfiguration): string | null {
	if (config.apiProvider === "openrouter" && config.openRouterBaseUrl) {
		return config.openRouterBaseUrl
	}
	if (config.apiProvider === "openai" && config.openAiBaseUrl) {
		return config.openAiBaseUrl
	}
	return null
}

/**
 * Build ChatParams for POST /chat from apiConfiguration and question.
 */
export function buildEigentChatParams(
	apiConfiguration: ApiConfiguration,
	question: string,
	images?: string[],
	workspacePath?: string,
): ChatParams {
	const api = buildApiHandler(apiConfiguration)
	const model = api.getModel()
	const id = crypto.randomUUID()
	const projectId = id
	const taskId = id

	const attaches: string[] = images ?? []

	return {
		task_id: taskId,
		project_id: projectId,
		question,
		email: "user@ascende.local",
		attaches,
		model_platform: "openai-compatible-model",
		model_type: model.id,
		api_key: getApiKey(apiConfiguration),
		api_url: getApiUrl(apiConfiguration),
		language: "en",
		browser_port: 9222,
		max_retries: 3,
		allow_local_system: true,
		installed_mcp: { mcpServers: {} },
		file_save_path: workspacePath ?? getWorkspacePath(),
	}
}
