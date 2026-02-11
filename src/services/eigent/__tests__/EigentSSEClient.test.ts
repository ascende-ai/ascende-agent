/**
 * Unit tests for EigentSSEClient.
 */
import { EigentSSEClient } from "../EigentSSEClient"
import type { ChatParams } from "../types"

const BASE = "http://test.example.com"

describe("EigentSSEClient", () => {
	let fetchSpy: jest.SpyInstance

	beforeEach(() => {
		fetchSpy = jest.spyOn(globalThis, "fetch")
	})

	afterEach(() => {
		fetchSpy.mockRestore()
	})

	describe("constructor", () => {
		it("strips trailing slash from baseUrl", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: "http://x/" })
			await client.stopChat("p1")
			expect(fetchSpy).toHaveBeenCalledWith("http://x/chat/p1", expect.any(Object))
		})
	})

	describe("startChat", () => {
		it("POSTs to /chat and parses SSE events", async () => {
			const events = [
				JSON.stringify({ step: "confirmed", data: { question: "hi" } }),
				JSON.stringify({ step: "end", data: {} }),
			]
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(`data: ${events[0]}\n\n`))
					controller.enqueue(new TextEncoder().encode(`data: ${events[1]}\n\n`))
					controller.close()
				},
			})

			fetchSpy.mockResolvedValue({
				ok: true,
				body: stream,
				status: 200,
			})

			const client = new EigentSSEClient({ baseUrl: BASE })
			const params: ChatParams = {
				project_id: "p1",
				task_id: "t1",
				question: "hello",
				email: "u@test.com",
				model_platform: "openai",
				model_type: "gpt-4",
				api_key: "sk-xxx",
			}

			const received: Array<{ step: string }> = []
			for await (const e of client.startChat(params)) {
				received.push({ step: e.step })
			}

			expect(received).toEqual([{ step: "confirmed" }, { step: "end" }])
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat`,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ "Content-Type": "application/json" }),
					body: expect.stringContaining('"question":"hello"'),
				}),
			)
		})

		it("adds Authorization header when apiKey provided", async () => {
			const stream = new ReadableStream({ start(c) { c.close() } })
			fetchSpy.mockResolvedValue({ ok: true, body: stream })

			const client = new EigentSSEClient({ baseUrl: BASE, apiKey: "secret" })
			const params: ChatParams = {
				project_id: "p1",
				task_id: "t1",
				question: "q",
				email: "e@e.com",
				model_platform: "openai",
				model_type: "gpt-4",
				api_key: "sk-x",
			}

			for await (const _ of client.startChat(params)) {
				/* consume */
			}

			expect(fetchSpy.mock.calls[0][1].headers).toMatchObject({
				Authorization: "Bearer secret",
			})
		})

		it("throws on non-ok response", async () => {
			fetchSpy.mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: () => Promise.resolve("Server error"),
			})

			const client = new EigentSSEClient({ baseUrl: BASE })
			const params: ChatParams = {
				project_id: "p1",
				task_id: "t1",
				question: "q",
				email: "e@e.com",
				model_platform: "openai",
				model_type: "gpt-4",
				api_key: "sk-x",
			}

			await expect(async () => {
				for await (const _ of client.startChat(params)) {
					/* consume */
				}
			}).rejects.toThrow(/Eigent startChat failed/)
		})
	})

	describe("stopChat", () => {
		it("DELETEs /chat/{projectId}", async () => {
			fetchSpy.mockResolvedValue({ ok: true, status: 204 })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.stopChat("proj-1")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1`,
				expect.objectContaining({ method: "DELETE" }),
			)
		})
	})

	describe("humanReply", () => {
		it("POSTs agent and reply to /chat/{id}/human-reply", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.humanReply("proj-1", "agent-1", "yes, proceed")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1/human-reply`,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ agent: "agent-1", reply: "yes, proceed" }),
				}),
			)
		})
	})

	describe("toolResult", () => {
		it("POSTs request_id, tool_name, result to /chat/{id}/tool-result", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.toolResult("proj-1", "req-123", "execute_file_write", {
				success: true,
				content: "written",
			})
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1/tool-result`,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						request_id: "req-123",
						tool_name: "execute_file_write",
						result: { success: true, content: "written" },
					}),
				}),
			)
		})
	})

	describe("addTask", () => {
		it("POSTs content to /chat/{id}/add-task", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.addTask("proj-1", "New subtask")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1/add-task`,
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining('"content":"New subtask"'),
				}),
			)
		})
	})

	describe("removeTask", () => {
		it("DELETEs /chat/{projectId}/remove-task/{taskId}", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.removeTask("proj-1", "task-99")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1/remove-task/task-99`,
				expect.objectContaining({ method: "DELETE" }),
			)
		})
	})

	describe("skipTask", () => {
		it("POSTs to /chat/{projectId}/skip-task", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.skipTask("proj-1")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1/skip-task`,
				expect.objectContaining({ method: "POST" }),
			)
		})
	})

	describe("improve", () => {
		it("POSTs question to /chat/{projectId}", async () => {
			fetchSpy.mockResolvedValue({ ok: true })
			const client = new EigentSSEClient({ baseUrl: BASE })
			await client.improve("proj-1", "Make it faster")
			expect(fetchSpy).toHaveBeenCalledWith(
				`${BASE}/chat/proj-1`,
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining('"question":"Make it faster"'),
				}),
			)
		})
	})
})
