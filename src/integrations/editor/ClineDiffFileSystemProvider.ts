import * as vscode from "vscode"

/**
 * FileSystemProvider for cline-diff: URIs.
 *
 * The diff view uses TextDocumentContentProvider for opening documents, but some
 * IDE flows (e.g. Problems panel "Open", file resolution) use the file service,
 * which requires a FileSystemProvider. Without it, opening cline-diff: URIs fails
 * with "Unable to resolve filesystem provider".
 *
 * This provider decodes content from the URI query (base64), matching the
 * behavior of DiffViewProvider's TextDocumentContentProvider. Read-only.
 */
export class ClineDiffFileSystemProvider implements vscode.FileSystemProvider {
	private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
	readonly onDidChangeFile = this._onDidChangeFile.event

	watch(_uri: vscode.Uri): vscode.Disposable {
		return new vscode.Disposable(() => {})
	}

	stat(uri: vscode.Uri): vscode.FileStat {
		const content = this.getContent(uri)
		return {
			type: vscode.FileType.File,
			ctime: 0,
			mtime: 0,
			size: Buffer.byteLength(content, "utf-8"),
		}
	}

	readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
		return []
	}

	createDirectory(_uri: vscode.Uri): void {
		throw vscode.FileSystemError.NoPermissions("cline-diff is read-only")
	}

	readFile(uri: vscode.Uri): Uint8Array {
		const content = this.getContent(uri)
		return new TextEncoder().encode(content)
	}

	writeFile(
		_uri: vscode.Uri,
		_content: Uint8Array,
		_options: { create: boolean; overwrite: boolean },
	): void {
		throw vscode.FileSystemError.NoPermissions("cline-diff is read-only")
	}

	delete(_uri: vscode.Uri): void {
		throw vscode.FileSystemError.NoPermissions("cline-diff is read-only")
	}

	rename(
		_oldUri: vscode.Uri,
		_newUri: vscode.Uri,
		_options: { overwrite: boolean },
	): void {
		throw vscode.FileSystemError.NoPermissions("cline-diff is read-only")
	}

	private getContent(uri: vscode.Uri): string {
		try {
			const query = uri.query || ""
			if (!query) {
				return ""
			}
			return Buffer.from(query, "base64").toString("utf-8")
		} catch {
			return ""
		}
	}
}
