/**
 * Eigent orchestrator: consumes SSE from Eigent backend and drives the webview.
 * Replaces the Cline loop when using Ascende Eigent backend.
 */
import EventEmitter from "events"
import * as vscode from "vscode"

import { EigentSSEClient } from "../services/eigent"
import type {
	AgentStep,
	ChatParams,
	SSEEvent,
	ToolResult,
} from "../services/eigent/types"
import type {
	ExecuteFileWriteData,
	ExecuteListFilesData,
	ExecuteReadFileData,
	ExecuteSearchReplaceData,
	ExecuteTerminalData,
} from "../services/eigent/types"
import { ToolExecutor } from "./eigent/ToolExecutor"
import { getWorkspacePath } from "../utils/path"
import { getAscendeBackendUrl, getAscendeApiKey } from "../shared/ascendeBackend"

export type EigentOrchestratorEvents = {
	taskStarted: []
	taskCompleted: [taskId: string]
	taskAborted: []
}

export interface EigentOrchestratorOptions {
	context: vscode.ExtensionContext
	workspacePath?: string
	postMessage: (message: Record<string, unknown>) => void
	/** Build ChatParams from current state (API config, model, etc.) */
	buildChatParams: (question: string, images?: string[]) => Promise<ChatParams>
}

export class EigentOrchestrator extends EventEmitter<EigentOrchestratorEvents> {
	private client!: EigentSSEClient
	private toolExecutor!: ToolExecutor
	private projectId: string = ""
	private taskId: string = ""
	private aborted: boolean = false
	private pendingHumanReply: {
		agent: string
		resolve: (reply: string) => void
	} | null = null

	constructor(private readonly options: EigentOrchestratorOptions) {
		super()
	}

	get isRunning(): boolean {
		return !!this.projectId && !this.aborted
	}

	/**
	 * Submit human reply when webview user responds to an `ask` event.
	 * Called by provider when it receives humanReplySubmitted.
	 */
	submitHumanReply(reply: string): void {
		if (this.pendingHumanReply) {
			this.pendingHumanReply.resolve(reply)
			this.pendingHumanReply = null
		}
	}

	/**
	 * Start a new task. Consumes SSE until end/error/timeout.
	 */
	async startTask(question: string, images?: string[]): Promise<void> {
		this.aborted = false
		const params = await this.options.buildChatParams(question, images)
		this.projectId = params.project_id
		this.taskId = params.task_id

		const baseUrl = getAscendeBackendUrl()
		const apiKey = await getAscendeApiKey(this.options.context)
		this.client = new EigentSSEClient({ baseUrl, apiKey: apiKey ?? undefined })
		this.toolExecutor = new ToolExecutor(
			this.options.workspacePath ?? getWorkspacePath(),
		)

		this.emit("taskStarted")

		try {
			for await (const event of this.client.startChat(params)) {
				if (this.aborted) break
				await this.handleEvent(event)
				if (["end", "error", "timeout"].includes(event.step)) break
			}
			this.emit("taskCompleted", this.taskId)
		} catch (e) {
			if (!this.aborted) {
				this.options.postMessage({
					type: "eigentEvent",
					step: "error",
					data: { message: e instanceof Error ? e.message : String(e) },
				})
			}
			this.emit("taskAborted")
		} finally {
			this.projectId = ""
			this.taskId = ""
		}
	}

	/**
	 * Abort the current task (stop chat).
	 */
	async abortTask(): Promise<void> {
		this.aborted = true
		if (this.pendingHumanReply) {
			this.pendingHumanReply.resolve("")
			this.pendingHumanReply = null
		}
		if (this.projectId && this.client) {
			await this.client.stopChat(this.projectId).catch(() => {})
		}
		this.emit("taskAborted")
	}

	private async handleEvent(event: SSEEvent): Promise<void> {
		this.options.postMessage({
			type: "eigentEvent",
			step: event.step,
			data: event.data,
		})

		const step = event.step
		const data = event.data as Record<string, unknown>

		switch (step) {
			case "ask": {
				const agent = (data.agent as string) ?? ""
				const reply = await this.waitForHumanReply(agent)
				if (reply && this.client && this.projectId) {
					await this.client.humanReply(this.projectId, agent, reply)
				}
				break
			}
			case "execute_file_write":
				await this.executeAndPostResult("execute_file_write", data)
				break
			case "execute_read_file":
				await this.executeAndPostResult("execute_read_file", data)
				break
			case "execute_search_replace":
				await this.executeAndPostResult("execute_search_replace", data)
				break
			case "execute_list_files":
				await this.executeAndPostResult("execute_list_files", data)
				break
			case "execute_terminal":
				await this.executeAndPostResult("execute_terminal", data)
				break
			default:
				// confirmed, to_sub_tasks, create_agent, etc. — already sent via postMessage
				break
		}
	}

	private waitForHumanReply(agent: string): Promise<string> {
		return new Promise((resolve) => {
			this.pendingHumanReply = { agent, resolve }
		})
	}

	private async executeAndPostResult(toolName: AgentStep, data: Record<string, unknown>): Promise<void> {
		const requestId = data.request_id as string
		if (!requestId || !this.client || !this.projectId) return

		let result: ToolResult
		switch (toolName) {
			case "execute_file_write":
				result = await this.toolExecutor.executeFileWrite(data as unknown as ExecuteFileWriteData)
				break
			case "execute_read_file":
				result = await this.toolExecutor.executeReadFile(data as unknown as ExecuteReadFileData)
				break
			case "execute_search_replace":
				result = await this.toolExecutor.executeSearchReplace(data as unknown as ExecuteSearchReplaceData)
				break
			case "execute_list_files":
				result = await this.toolExecutor.executeListFiles(data as unknown as ExecuteListFilesData)
				break
			case "execute_terminal":
				result = await this.toolExecutor.executeTerminal(data as unknown as ExecuteTerminalData)
				break
			default:
				return
		}

		await this.client.toolResult(
			this.projectId,
			requestId,
			toolName,
			result,
		)
	}
}
