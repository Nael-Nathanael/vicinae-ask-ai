import { runCli } from "./spawn.ts";
import { type Provider, ProviderError, transcript } from "./types.ts";

const LOGIN_HINT = "If you're signed out, run `agy` in a terminal and sign in.";

/** Maps one `agy -p --output-format stream-json` line to answer text, or throws on a failed result. */
export function antigravityLine(line: string): string | undefined {
	const msg = JSON.parse(line);
	const step = msg.step_update;
	if (msg.event === "step_update" && step?.step_type === "agent_response" && step.text_delta) return step.text_delta;
	if (msg.event === "result" && msg.result?.status !== "SUCCESS") {
		throw new ProviderError(`Antigravity: ${msg.result?.error ?? msg.result?.status ?? "failed"}\n\n${LOGIN_HINT}`);
	}
}

export const antigravity: Provider = {
	id: "antigravity",
	title: "Antigravity",
	async stream(messages, opts) {
		const prompt = `${opts.systemPrompt}\n\n${transcript(messages)}`;
		// agy only takes the prompt as an argument; Linux caps one argument at 128 KiB.
		if (Buffer.byteLength(prompt) > 120_000) {
			throw new ProviderError("This conversation is too long for Antigravity. Start a new conversation (Ctrl+N).");
		}
		const args = [
			"--output-format", "stream-json",
			"--print-timeout", "290s",
			"--disable-slash-commands",
			...(opts.model ? ["--model", opts.model] : []),
			// Attached with "=" so a prompt starting with "-" is never read as a flag.
			`--print=${prompt}`,
		];
		let failure: unknown;
		const run = runCli({
			name: "agy",
			label: "Antigravity",
			loginHint: LOGIN_HINT,
			args,
			cwd: opts.workdir,
			extraPath: opts.extraPath,
			signal: opts.signal,
			onLine(line) {
				try {
					const text = antigravityLine(line);
					if (text) opts.onDelta(text);
				} catch (err) {
					failure ??= err;
				}
			},
		});
		await run.done.catch((err) => {
			throw failure ?? err;
		});
		if (failure) throw failure;
	},
};
