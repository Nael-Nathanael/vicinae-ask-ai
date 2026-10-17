import { anthropic } from "./anthropic.ts";
import { antigravity } from "./antigravity.ts";
import { claudeCode } from "./claude-code.ts";
import { codex } from "./codex.ts";
import { gemini } from "./gemini.ts";
import { openai } from "./openai.ts";
import type { Provider, ProviderId } from "./types.ts";

export const providers: Provider[] = [anthropic, openai, gemini, claudeCode, codex, antigravity];

export const providerById = (id: string): Provider => providers.find((p) => p.id === id) ?? claudeCode;

export type { Message, Provider, ProviderId } from "./types.ts";
export { ProviderError } from "./types.ts";
