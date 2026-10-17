import Anthropic from "@anthropic-ai/sdk";
import { type Provider, ProviderError, requireKey } from "./types.ts";

export const anthropic: Provider = {
	id: "anthropic",
	title: "Claude API",
	async stream(messages, opts) {
		const client = new Anthropic({ apiKey: requireKey(opts, "Anthropic API", "Anthropic API Key") });
		try {
			const stream = client.beta.messages.stream(
				{
					model: opts.model || "claude-opus-5-5",
					max_tokens: 64000,
					system: opts.systemPrompt,
					messages,
					output_config: { effort: "low" },
					// Re-runs a safety-declined request on Anthropic's recommended fallback model.
					betas: ["server-side-fallback-2026-07-01"],
					fallbacks: "default",
				},
				{ signal: opts.signal },
			);
			for await (const event of stream) {
				if (event.type === "content_block_delta" && event.delta.type === "text_delta") opts.onDelta(event.delta.text);
			}
			const final = await stream.finalMessage();
			if (final.stop_reason === "refusal") throw new ProviderError("Claude declined to answer this one.");
		} catch (err) {
			if (err instanceof Anthropic.APIUserAbortError) throw new DOMException("Aborted", "AbortError");
			if (err instanceof Anthropic.AuthenticationError) {
				throw new ProviderError("The Anthropic API key was rejected. Check **Anthropic API Key** in this command's settings.");
			}
			if (err instanceof Anthropic.RateLimitError) throw new ProviderError("Anthropic API: rate limited. Try again in a moment.");
			if (err instanceof Anthropic.APIError) throw new ProviderError(`Anthropic API ${err.status ?? ""}: ${err.message}`);
			throw err;
		}
	},
};
