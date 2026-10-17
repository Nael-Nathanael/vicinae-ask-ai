import { assertOk, sseEvents } from "./sse.ts";
import { type Provider, ProviderError, requireKey } from "./types.ts";

/** Maps one Responses API stream event to answer text, or throws on failure. */
export function openaiEvent(data: string): string | undefined {
	const event = JSON.parse(data);
	if (event.type === "response.output_text.delta") return event.delta;
	if (event.type === "error") throw new ProviderError(`OpenAI API: ${event.error?.message ?? event.message ?? "error"}`);
	if (event.type === "response.failed") throw new ProviderError(`OpenAI API: ${event.response?.error?.message ?? "failed"}`);
}

export const openai: Provider = {
	id: "openai",
	title: "OpenAI API",
	async stream(messages, opts) {
		const res = await fetch("https://api.openai.com/v1/responses", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${requireKey(opts, "OpenAI API", "OpenAI API Key")}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: opts.model || "gpt-5.5",
				instructions: opts.systemPrompt,
				input: messages.map((m) => ({ role: m.role, content: m.content })),
				stream: true,
				store: false,
			}),
			signal: opts.signal,
		});
		await assertOk(res, "OpenAI API");
		for await (const { data } of sseEvents(res.body!)) {
			const text = openaiEvent(data);
			if (text) opts.onDelta(text);
		}
	},
};
