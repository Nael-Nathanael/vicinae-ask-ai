import { anthropic } from "./anthropic.ts";
import { antigravity } from "./antigravity.ts";
import { claudeCode } from "./claude-code.ts";
import { codex } from "./codex.ts";
import { gemini } from "./gemini.ts";
import type { Provider } from "./types.ts";

// The OpenAI provider (./openai.ts) is not offered until it has been tested with a real key.
export const providers: Provider[] = [claudeCode, codex, antigravity, anthropic, gemini];

export const providerById = (id: string): Provider => providers.find((p) => p.id === id) ?? claudeCode;

export type { Message, Provider, ProviderId } from "./types.ts";
export { ProviderError } from "./types.ts";
