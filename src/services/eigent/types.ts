/**
 * Eigent protocol types.
 * Aligned with eigent-backend app/service/task.py Action enum and app/model/chat.py.
 */

/** SSE step names from backend. Matches Action enum values. */
export type AgentStep =
	| "confirmed"
	| "to_sub_tasks"
	| "create_agent"
	| "assign_task"
	| "activate_agent"
	| "deactivate_agent"
	| "ask"
	| "task_state"
	| "new_task_state"
	| "end"
	| "error"
	| "timeout"
	| "write_file"
	| "terminal"
	| "notice"
	| "search_mcp"
	| "decompose_text"
	| "decompose_progress"
	| "add_task"
	| "remove_task"
	// Client-delegated tool execution (backend -> client, await result)
	| "execute_file_write"
	| "execute_read_file"
	| "execute_search_replace"
	| "execute_list_files"
	| "execute_terminal"

/** Parsed SSE event from backend stream. */
export interface SSEEvent {
	step: AgentStep
	data: Record<string, unknown>
}

/** Params for POST /chat. Aligned with eigent-backend Chat model. */
export interface ChatParams {
	task_id: string
	project_id: string
	question: string
	email: string
	attaches?: string[]
	model_platform: string
	model_type: string
	api_key: string
	api_url?: string | null
	language?: string
	browser_port?: number
	max_retries?: number
	allow_local_system?: boolean
	installed_mcp?: { mcpServers: Record<string, Record<string, unknown>> }
	env_path?: string | null
	/** Workspace path for file_save_path; client passes workspace root. */
	file_save_path?: string
}

/** Tool execution result sent via POST /chat/{project_id}/tool-result. */
export interface ToolResult {
	success: boolean
	content?: string
	error?: string
	[key: string]: unknown
}

/** Execute_file_write event payload. */
export interface ExecuteFileWriteData {
	request_id: string
	path: string
	content: string
}

/** Execute_read_file event payload. */
export interface ExecuteReadFileData {
	request_id: string
	path: string
}

/** Execute_search_replace event payload. */
export interface ExecuteSearchReplaceData {
	request_id: string
	path: string
	old_string: string
	new_string: string
}

/** Execute_list_files event payload. */
export interface ExecuteListFilesData {
	request_id: string
	pattern: string
}

/** Execute_terminal event payload. */
export interface ExecuteTerminalData {
	request_id: string
	command: string
	cwd?: string
}
