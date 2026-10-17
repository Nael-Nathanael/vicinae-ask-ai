import {
	Action,
	ActionPanel,
	Icon,
	List,
	clearSearchBar,
	environment,
	getPreferenceValues,
	openExtensionPreferences,
	useNavigation,
} from "@vicinae/api";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useEffect, useRef, useState } from "react";
import { History } from "./history.tsx";
import { type ProviderId, ProviderError, providerById, providers } from "./providers/index.ts";
import {
	type Conversation,
	type Turn,
	history,
	listConversations,
	loadConversation,
	newConversation,
	newId,
	saveConversation,
} from "./store.ts";

type Preferences = {
	defaultProvider?: ProviderId;
	anthropicApiKey?: string;
	anthropicModel?: string;
	openaiApiKey?: string;
	openaiModel?: string;
	geminiApiKey?: string;
	geminiModel?: string;
	claudeCodeModel?: string;
	codexModel?: string;
	antigravityModel?: string;
	systemPrompt?: string;
	extraPath?: string;
};

/** The host replays fallback text right after mount; anything later is the user typing. */
const FALLBACK_WINDOW_MS = 500;
/** Reopening the command within this window continues the last conversation. */
const RESUME_WINDOW_MS = 10 * 60_000;
const FLUSH_MS = 100;
const SAVE_MS = 2000;

function settingsFor(id: ProviderId, prefs: Preferences): { apiKey?: string; model?: string } {
	switch (id) {
		case "anthropic":
			return { apiKey: prefs.anthropicApiKey, model: prefs.anthropicModel };
		case "openai":
			return { apiKey: prefs.openaiApiKey, model: prefs.openaiModel };
		case "gemini":
			return { apiKey: prefs.geminiApiKey, model: prefs.geminiModel };
		case "claude-code":
			return { model: prefs.claudeCodeModel };
		case "codex":
			return { model: prefs.codexModel };
		case "antigravity":
			return { model: prefs.antigravityModel };
	}
}

function lastCodeBlock(markdown: string): string | undefined {
	const blocks = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
	return blocks.at(-1)?.[1].replace(/\n$/, "");
}

/** A saved conversation can hold a turn that was cut off mid-answer. */
const withoutStreaming = (conv: Conversation): Conversation => ({
	...conv,
	turns: conv.turns.map((t) => (t.status === "streaming" ? { ...t, status: "stopped" } : t)),
});

function turnMarkdown(turn: Turn): string {
	const title = providerById(turn.providerId).title;
	const body =
		turn.status === "error"
			? `${turn.answer ? `${turn.answer}\n\n---\n\n` : ""}**Couldn't get an answer.**\n\n${turn.error}`
			: turn.status === "stopped"
				? `${turn.answer ? `${turn.answer}\n\n` : ""}_Stopped._`
				: turn.answer || "_Thinking…_";
	return `**${title}**\n\n${body}`;
}

export default function AskAI(props: { fallbackText?: string }) {
	const prefs = getPreferenceValues<Preferences>();
	const { push } = useNavigation();
	const [conv, setConv] = useState<Conversation>(() => newConversation(providerById(prefs.defaultProvider ?? "").id));
	const [query, setQuery] = useState("");
	const [loadingSaved, setLoadingSaved] = useState(true);

	const convRef = useRef(conv);
	convRef.current = conv;
	const mountedAt = useRef(Date.now());
	const sawSearchEvent = useRef(false);
	const fallbackSent = useRef<string | undefined>(undefined);
	const abortRef = useRef<AbortController | undefined>(undefined);

	const streaming = conv.turns.some((t) => t.status === "streaming");

	const updateTurn = useCallback((turnId: string, patch: Partial<Turn>) => {
		setConv((c) => ({ ...c, updatedAt: Date.now(), turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)) }));
	}, []);

	const send = useCallback(
		async (raw: string, fresh = false) => {
			const question = raw.trim();
			if (!question) return;
			if (fresh) convRef.current = newConversation(convRef.current.providerId);
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			clearSearchBar();
			setQuery("");

			const base = convRef.current;
			const provider = providerById(base.providerId);
			const turn: Turn = { id: newId(), question, answer: "", providerId: provider.id, createdAt: Date.now(), status: "streaming" };
			const messages = [...history(base), { role: "user" as const, content: question }];
			const next = { ...base, title: base.title || question.slice(0, 80), updatedAt: Date.now(), turns: [...base.turns, turn] };
			convRef.current = next;
			setConv(next);

			const workdir = join(environment.supportPath, "workdir");
			mkdirSync(workdir, { recursive: true });

			// Deltas arrive faster than the host can re-render; batch them.
			let answer = "";
			let flushed = "";
			let rev = 0;
			const flush = () => {
				if (answer !== flushed) {
					flushed = answer;
					updateTurn(turn.id, { answer, rev: ++rev });
				}
			};
			const flushTimer = setInterval(flush, FLUSH_MS);
			const saveTimer = setInterval(() => saveConversation(convRef.current), SAVE_MS);

			try {
				await provider.stream(messages, {
					...settingsFor(provider.id, prefs),
					systemPrompt: prefs.systemPrompt?.trim() || "Be direct and brief. Use Markdown.",
					workdir,
					extraPath: prefs.extraPath,
					signal: controller.signal,
					onDelta: (text) => {
						answer += text;
					},
				});
				updateTurn(turn.id, { answer, status: answer ? "done" : "error", error: answer ? undefined : "The answer was empty." });
			} catch (err) {
				if (controller.signal.aborted) {
					updateTurn(turn.id, { answer, status: "stopped" });
				} else {
					const message = err instanceof ProviderError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
					updateTurn(turn.id, { answer, status: "error", error: message });
				}
			} finally {
				clearInterval(flushTimer);
				clearInterval(saveTimer);
				if (abortRef.current === controller) abortRef.current = undefined;
				// Let the final state update land before saving.
				setTimeout(() => saveConversation(convRef.current), 0);
			}
		},
		[prefs, updateTurn],
	);

	// Newer Vicinae passes the fallback text as a prop.
	useEffect(() => {
		if (props.fallbackText?.trim()) {
			fallbackSent.current = props.fallbackText;
			send(props.fallbackText, true);
		}
	}, []);

	// A normal launch continues a recent conversation; a fallback launch starts fresh.
	useEffect(() => {
		listConversations()
			.then(async ([latest]) => {
				if (!latest || Date.now() - latest.updatedAt > RESUME_WINDOW_MS) return;
				const saved = await loadConversation(latest.id);
				if (saved && !fallbackSent.current && convRef.current.turns.length === 0) setConv(withoutStreaming(saved));
			})
			.finally(() => setLoadingSaved(false));
	}, []);

	// Stop any running answer when the window closes or the command is left.
	useEffect(
		() => () => {
			abortRef.current?.abort();
			saveConversation(convRef.current);
		},
		[],
	);

	const onSearchTextChange = (text: string) => {
		const first = !sawSearchEvent.current;
		sawSearchEvent.current = true;
		if (first && text.trim() && Date.now() - mountedAt.current < FALLBACK_WINDOW_MS) {
			if (fallbackSent.current !== text) {
				fallbackSent.current = text;
				send(text, true);
			}
			return;
		}
		if (text === fallbackSent.current && Date.now() - mountedAt.current < FALLBACK_WINDOW_MS) return;
		setQuery(text);
	};

	const setProvider = (id: string) => {
		// The dropdown reports its value once when it mounts; only real changes matter.
		if (id === convRef.current.providerId || Date.now() - mountedAt.current < FALLBACK_WINDOW_MS) return;
		setConv((c) => ({ ...c, providerId: providerById(id).id }));
	};

	const startNew = () => {
		abortRef.current?.abort();
		setConv((c) => newConversation(c.providerId));
	};

	const openSaved = async (id: string) => {
		const saved = await loadConversation(id);
		if (!saved) return;
		abortRef.current?.abort();
		setConv(withoutStreaming(saved));
	};

	const sendAction = query.trim() ? (
		<Action title="Send" icon={Icon.ArrowRight} onAction={() => send(query)} />
	) : null;

	const commonActions = (
		<>
			<Action
				title="New Conversation"
				icon={Icon.Plus}
				shortcut="new"
				onAction={startNew}
			/>
			<Action
				title="History"
				icon={Icon.Clock}
				shortcut={{ modifiers: ["ctrl"], key: "h" }}
				onAction={() => push(<History onOpen={openSaved} />)}
			/>
			<Action title="Open Settings" icon={Icon.Cog} shortcut={{ modifiers: ["ctrl"], key: "," }} onAction={openExtensionPreferences} />
		</>
	);

	const turns = [...conv.turns].reverse();
	const providerTitle = providerById(conv.providerId).title;

	return (
		<List
			isShowingDetail={turns.length > 0}
			isLoading={streaming || loadingSaved}
			filtering={false}
			onSearchTextChange={onSearchTextChange}
			searchBarPlaceholder={turns.length ? `Ask a follow-up (${providerTitle})` : `Ask ${providerTitle} anything`}
			navigationTitle={conv.title || "Ask AI"}
			searchBarAccessory={
				<List.Dropdown tooltip="Provider" value={conv.providerId} onChange={setProvider}>
					{providers.map((p) => (
						<List.Dropdown.Item key={p.id} title={p.title} value={p.id} />
					))}
				</List.Dropdown>
			}
			actions={
				<ActionPanel>
					{sendAction}
					{commonActions}
				</ActionPanel>
			}
		>
			<List.EmptyView
				title={query.trim() ? "Press Enter to ask" : "Ask anything"}
				description={`Answers come from ${providerTitle}. Switch provider with the dropdown.`}
				icon={Icon.Stars}
				actions={
					<ActionPanel>
						{sendAction}
						{commonActions}
					</ActionPanel>
				}
			/>
			{turns.map((turn) => {
				const code = lastCodeBlock(turn.answer);
				return (
					<List.Item
						key={turn.id}
						id={turn.id}
						// Vicinae before 0.24 redraws the detail pane only when the selected item changes, and it
						// tells items apart by title. An invisible character that flips per update forces the redraw.
						title={turn.status === "streaming" ? `${turn.question}${"​".repeat(((turn.rev ?? 0) % 2) + 1)}` : turn.question}
						icon={turn.status === "error" ? Icon.Warning : turn.status === "streaming" ? Icon.Stars : Icon.SpeechBubble}
						detail={<List.Item.Detail markdown={turnMarkdown(turn)} isLoading={turn.status === "streaming"} />}
						actions={
							<ActionPanel>
								{sendAction}
								<Action.CopyToClipboard title="Copy Answer" content={turn.answer} shortcut="copy" />
								<Action.Paste title="Paste Answer" content={turn.answer} />
								{code !== undefined && (
									<Action.CopyToClipboard
										title="Copy Last Code Block"
										content={code}
										shortcut={{ modifiers: ["ctrl", "shift"], key: "k" }}
									/>
								)}
								<Action.CopyToClipboard title="Copy Question" content={turn.question} />
								{turn.status === "streaming" ? (
									<Action
										title="Stop"
										icon={Icon.Stop}
										shortcut={{ modifiers: ["ctrl"], key: "." }}
										onAction={() => abortRef.current?.abort()}
									/>
								) : (
									<Action
										title="Ask Again"
										icon={Icon.ArrowClockwise}
										shortcut={{ modifiers: ["ctrl"], key: "r" }}
										onAction={() => send(turn.question)}
									/>
								)}
								{commonActions}
							</ActionPanel>
						}
					/>
				);
			})}
		</List>
	);
}
