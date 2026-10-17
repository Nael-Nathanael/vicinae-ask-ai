# Ask AI for Vicinae

Type a question into [Vicinae](https://vicinae.com). If nothing matches, press Enter and the answer streams into the same window. Keep typing to ask follow-ups. It's the Spotlight-to-Siri flow from macOS, for Linux.

## Providers

Pick one in settings, or switch per conversation from the dropdown next to the search bar (Ctrl+P).

| Provider | Sign-in |
|---|---|
| Claude API | Anthropic API key |
| OpenAI API | OpenAI API key |
| Gemini API | Gemini API key |
| Claude Code | Your existing `claude` login |
| Codex | Your existing `codex` login |
| Antigravity | Your existing `agy` login |

The last three run the official command-line tool you already have installed and signed in to. The extension never reads their credentials. Each question runs in an empty folder with tools turned off, so these providers get no file access, no shell, and no MCP servers.

**Antigravity warning:** Google has suspended accounts for using third-party software with an Antigravity login. The reported cases extracted OAuth tokens, which this extension doesn't do, but the risk is yours. It is never the default.

## Install

```sh
git clone https://github.com/Nael-Nathanael/vicinae-ask-ai
cd vicinae-ask-ai
npm install
npm run build
```

Then, in Vicinae:

1. Open **Configure Fallback Commands**.
2. Search for **Ask AI**, press Enter to enable it, and keep it at the top of the list.

Settings live in Vicinae under the extension's preferences (Ctrl+, inside Ask AI).

## Use

- Type a question in the root search and press Enter on **Ask AI**.
- Type a follow-up and press Enter. Every follow-up includes the earlier turns, even after switching provider.
- Press Enter with an empty search bar to copy the selected answer.

| Shortcut | Action |
|---|---|
| Ctrl+P | Switch provider |
| Ctrl+N | New conversation |
| Ctrl+H | History |
| Ctrl+. | Stop the answer |
| Ctrl+R | Ask again |
| Ctrl+Shift+K | Copy the last code block |

Launching Ask AI from the fallback always starts a new conversation. Opening it by name continues the last conversation if it was active in the past 10 minutes. The 100 most recent conversations are kept.

## Troubleshooting

- **"Couldn't find `claude`" (or `codex`, `agy`).** Vicinae runs as a systemd user service whose PATH often lacks your shell's additions. The extension also checks `~/.local/bin`. If your CLI lives elsewhere, add its folder under **Extra PATH**.
- **Signed out.** Run `claude auth login`, `codex login`, or `agy` in a terminal.

## Development

```sh
npm run dev        # hot reload into Vicinae
npm test           # unit tests
npm run typecheck
npm run lint       # manifest check
node --experimental-strip-types test/live.ts   # real calls to the three CLIs
```

Built against Vicinae 0.21.1 and works on newer versions.

## License

MIT
