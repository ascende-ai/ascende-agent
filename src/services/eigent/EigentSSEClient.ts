/**
 * Eigent SSE client for Ascende backend.
 * Connects to Eigent backend, starts chat (SSE stream), and handles control APIs.
 */
import type {
	AgentStep,
	ChatParams,
	SSEEvent,
	ToolResult,
} from "./types"

export interface EigentSSEClientOptions {
	baseUrl: string
	/** API key/token for Authorization header. If absent, no auth header is sent (local dev). */
	apiKey?: string
}

/**
 * Client for Eigent backend API.
 * - startChat: POST /chat, returns async iterable of SSE events
 * - stopChat, humanReply, toolResult, addTask, removeTask, skipTask, improve
 */
export class EigentSSEClient {
	private readonly baseUrl: string
	private readonly apiKey?: string

	constructor(options: EigentSSEClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, "")
		this.apiKey = options.apiKey
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
		}
		if (this.apiKey) {
			h["Authorization"] = `Bearer ${this.apiKey}`
		}
		return h
	}

	/**
	 * Start chat session. POST /chat, returns async iterable of SSE events.
	 */
	async *startChat(params: ChatParams): AsyncIterable<SSEEvent> {
		const res = await fetch(`${this.baseUrl}/chat`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(this.toChatBody(params)),
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent startChat failed: ${res.status} ${res.statusText} - ${text}`)
		}

		const reader = res.body?.getReader()
		if (!reader) {
			throw new Error("Eigent startChat: no response body")
		}

		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n\n")
				buffer = lines.pop() ?? ""

				for (const chunk of lines) {
					const event = this.parseSSEChunk(chunk)
					if (event) yield event
				}
			}

			if (buffer.trim()) {
				const event = this.parseSSEChunk(buffer)
				if (event) yield event
			}
		} finally {
			reader.releaseLock()
		}
	}

	private toChatBody(params: ChatParams): Record<string, unknown> {
		const body: Record<string, unknown> = {
			task_id: params.task_id,
			project_id: params.project_id,
			question: params.question,
			email: params.email,
			attaches: params.attaches ?? [],
			model_platform: params.model_platform,
			model_type: params.model_type,
			api_key: params.api_key,
			language: params.language ?? "en",
			browser_port: params.browser_port ?? 9222,
			max_retries: params.max_retries ?? 3,
			allow_local_system: params.allow_local_system ?? false,
			installed_mcp: params.installed_mcp ?? { mcpServers: {} },
		}
		if (params.api_url != null) body.api_url = params.api_url
		if (params.env_path != null) body.env_path = params.env_path
		return body
	}

	private parseSSEChunk(chunk: string): SSEEvent | null {
		const match = chunk.match(/^data:\s*(.+)$/m)
		if (!match) return null
		try {
			const data = JSON.parse(match[1].trim()) as { step: string; data: Record<string, unknown> }
			if (data.step) {
				return { step: data.step as AgentStep, data: data.data ?? {} }
			}
		} catch {
			// ignore parse errors
		}
		return null
	}

	/**
	 * Stop chat. DELETE /chat/{projectId}
	 */
	async stopChat(projectId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/chat/${projectId}`, {
			method: "DELETE",
			headers: this.headers(),
		})
		if (!res.ok && res.status !== 204) {
			const text = await res.text()
			throw new Error(`Eigent stopChat failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * Send human reply. POST /chat/{projectId}/human-reply
	 */
	async humanReply(projectId: string, agent: string, reply: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/chat/${projectId}/human-reply`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify({ agent, reply }),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent humanReply failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * POST tool execution result. POST /chat/{projectId}/tool-result
	 */
	async toolResult(
		projectId: string,
		requestId: string,
		toolName: string,
		result: ToolResult,
	): Promise<void> {
		const res = await fetch(`${this.baseUrl}/chat/${projectId}/tool-result`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify({ request_id: requestId, tool_name: toolName, result }),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent toolResult failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * Add task. POST /chat/{projectId}/add-task
	 */
	async addTask(
		projectId: string,
		content: string,
		options?: {
			taskId?: string
			additionalInfo?: Record<string, unknown>
			insertPosition?: number
			isIndependent?: boolean
		},
	): Promise<void> {
		const body: Record<string, unknown> = { content, project_id: projectId }
		if (options?.taskId != null) body.task_id = options.taskId
		if (options?.additionalInfo != null) body.additional_info = options.additionalInfo
		if (options?.insertPosition != null) body.insert_position = options.insertPosition
		if (options?.isIndependent != null) body.is_independent = options.isIndependent

		const res = await fetch(`${this.baseUrl}/chat/${projectId}/add-task`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent addTask failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * Remove task. DELETE /chat/{projectId}/remove-task/{taskId}
	 */
	async removeTask(projectId: string, taskId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/chat/${projectId}/remove-task/${taskId}`, {
			method: "DELETE",
			headers: this.headers(),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent removeTask failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * Skip task. POST /chat/{projectId}/skip-task
	 */
	async skipTask(projectId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/chat/${projectId}/skip-task`, {
			method: "POST",
			headers: this.headers(),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent skipTask failed: ${res.status} - ${text}`)
		}
	}

	/**
	 * Improve / follow-up. POST /chat/{projectId}
	 */
	async improve(
		projectId: string,
		question: string,
		options?: { taskId?: string; attaches?: string[] },
	): Promise<void> {
		const body: Record<string, unknown> = { question }
		if (options?.taskId != null) body.task_id = options.taskId
		if (options?.attaches != null) body.attaches = options.attaches

		const res = await fetch(`${this.baseUrl}/chat/${projectId}`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Eigent improve failed: ${res.status} - ${text}`)
		}
	}
}
