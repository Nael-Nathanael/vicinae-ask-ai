// Live check against the real CLIs (uses your logins and a little quota):
//   node --experimental-strip-types test/live.ts [claude-code|codex|antigravity ...]
// Runs with Vicinae's service PATH, which lacks ~/.local/bin, to prove the CLI lookup.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { antigravity } from "../src/providers/antigravity.ts";
import { claudeCode } from "../src/providers/claude-code.ts";
import { codex } from "../src/providers/codex.ts";
import type { Provider } from "../src/providers/types.ts";

process.env.PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const all: Provider[] = [claudeCode, codex, antigravity];
const wanted = process.argv.slice(2);
const workdir = mkdtempSync(join(tmpdir(), "ask-ai-live-"));

for (const provider of all.filter((p) => !wanted.length || wanted.includes(p.id))) {
	const started = Date.now();
	let firstDelta = 0;
	let answer = "";
	const messages = [
		{ role: "user" as const, content: "My favourite number is 41." },
		{ role: "assistant" as const, content: "Noted." },
		{ role: "user" as const, content: "-- What is my favourite number plus one? Reply with the number only." },
	];
	try {
		await provider.stream(messages, {
			systemPrompt: "Be direct and brief.",
			workdir,
			signal: AbortSignal.timeout(180_000),
			onDelta: (t) => {
				firstDelta ||= Date.now() - started;
				answer += t;
			},
		});
		console.log(`${provider.id}: ok first-delta=${firstDelta}ms total=${Date.now() - started}ms answer=${JSON.stringify(answer.trim())}`);
	} catch (err) {
		console.log(`${provider.id}: FAIL ${err instanceof Error ? err.message : err}`);
	}
}
