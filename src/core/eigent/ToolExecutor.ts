/**
 * Executes client-delegated tool requests using VS Code APIs.
 * Used when Eigent backend emits execute_* SSE events; orchestrator delegates here and POSTs results.
 */
import * as path from "path"
import * as vscode from "vscode"
import { execa } from "execa"

import type {
	ExecuteFileWriteData,
	ExecuteListFilesData,
	ExecuteReadFileData,
	ExecuteSearchReplaceData,
	ExecuteTerminalData,
	ToolResult,
} from "../../services/eigent/types"
import { listFiles } from "../../services/glob/list-files"

const UTF8 = { encoding: "utf-8" as const }

export class ToolExecutor {
	constructor(private readonly workspacePath: string) {}

	private resolvePath(relPath: string): string {
		return path.isAbsolute(relPath) ? relPath : path.resolve(this.workspacePath, relPath)
	}

	async executeFileWrite(data: ExecuteFileWriteData): Promise<ToolResult> {
		try {
			const fullPath = this.resolvePath(data.path)
			const uri = vscode.Uri.file(fullPath)
			const bytes = new TextEncoder().encode(data.content)
			await vscode.workspace.fs.writeFile(uri, bytes)
			return { success: true, content: `Written to ${data.path}` }
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : String(e) }
		}
	}

	async executeReadFile(data: ExecuteReadFileData): Promise<ToolResult> {
		try {
			const fullPath = this.resolvePath(data.path)
			const uri = vscode.Uri.file(fullPath)
			const bytes = await vscode.workspace.fs.readFile(uri)
			const content = new TextDecoder("utf-8").decode(bytes)
			return { success: true, content }
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : String(e) }
		}
	}

	async executeSearchReplace(data: ExecuteSearchReplaceData): Promise<ToolResult> {
		try {
			const fullPath = this.resolvePath(data.path)
			const uri = vscode.Uri.file(fullPath)
			const bytes = await vscode.workspace.fs.readFile(uri)
			const content = new TextDecoder("utf-8").decode(bytes)
			const newContent = content.split(data.old_string).join(data.new_string)
			if (content === newContent) {
				return { success: true, content: "No changes needed (old_string not found)" }
			}
			await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newContent))
			return { success: true, content: "Search and replace completed" }
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : String(e) }
		}
	}

	async executeListFiles(data: ExecuteListFilesData): Promise<ToolResult> {
		try {
			const pattern = data.pattern || "**/*"
			const isGlob = pattern.includes("*") || pattern.includes("?")
			let relativePaths: string[]

			if (isGlob) {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
				if (!workspaceFolder) {
					return { success: false, error: "No workspace folder" }
				}
				const uris = await vscode.workspace.findFiles(
					new vscode.RelativePattern(workspaceFolder, pattern),
					null,
					200,
				)
				relativePaths = uris.map((u) => path.relative(this.workspacePath, u.fsPath))
			} else {
				const dirPath = this.resolvePath(pattern)
				const [files, didHitLimit] = await listFiles(dirPath, true, 200)
				relativePaths = files.map((f) => path.relative(this.workspacePath, f))
				if (didHitLimit) {
					relativePaths.push("(... limit reached)")
				}
			}
			return { success: true, content: relativePaths.join("\n") }
		} catch (e) {
			return { success: false, error: e instanceof Error ? e.message : String(e) }
		}
	}

	async executeTerminal(data: ExecuteTerminalData): Promise<ToolResult> {
		try {
			const cwd = data.cwd ? this.resolvePath(data.cwd) : this.workspacePath
			const result = await execa(data.command, { shell: true, cwd, all: true })
			const output = result.all ?? result.stdout ?? result.stderr ?? ""
			return { success: result.exitCode === 0, content: output }
		} catch (e) {
			const err = e as { all?: string; stdout?: string; stderr?: string }
			const output = err.all ?? err.stdout ?? err.stderr ?? (e instanceof Error ? e.message : String(e))
			return { success: false, content: output, error: output }
		}
	}
}
