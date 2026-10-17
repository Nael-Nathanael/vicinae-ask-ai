import { type ElementNode, createLibrary, createParser, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * Rich answers in the spirit of ChatGPT's Intelligent UI, using OpenUI Lang (thesysdev/openui, MIT).
 * The model may add one ```openui-lang block; it renders as Markdown, and its buttons become actions.
 * Only components a Markdown pane can show are offered.
 */

const component = <T extends z.ZodRawShape>(name: string, description: string, props: T) =>
	defineComponent({ name, description, props: z.object(props), component: null });

const Title = component("Title", "Section heading", { text: z.string() });
const Text = component("Text", "Paragraph; Markdown allowed", { text: z.string() });
const List = component("List", "Bullet list, or numbered steps when ordered is true", {
	items: z.array(z.string()),
	ordered: z.boolean().optional(),
});
const Table = component("Table", "Table for comparisons and structured data", {
	columns: z.array(z.string()),
	rows: z.array(z.array(z.union([z.string(), z.number()]))),
});
const Chart = component("Chart", "Bar chart of numeric values, one bar per label", {
	title: z.string(),
	labels: z.array(z.string()),
	values: z.array(z.number()),
	unit: z.string().optional(),
});
const Stat = component("Stat", "One key figure with its label", { label: z.string(), value: z.string() });
const Callout = component("Callout", "Highlighted note", {
	text: z.string(),
	tone: z.enum(["info", "tip", "warning"]).optional(),
});
const Code = component("Code", "Code or a shell command", { code: z.string(), language: z.string().optional() });
const Image = component("Image", "Image from a public https URL you are sure exists", {
	url: z.string(),
	alt: z.string(),
});
const Place = component("Place", "A real place; rendered as a map link", { name: z.string(), note: z.string().optional() });
const LinkButton = component("LinkButton", "Button that opens a URL", { label: z.string(), url: z.string() });
const CopyButton = component("CopyButton", "Button that copies text to the clipboard", { label: z.string(), text: z.string() });
const FollowUp = component("FollowUp", "Suggested follow-up question the user can ask with one key", {
	question: z.string(),
});

const children = z.array(
	z.union([
		Title.ref,
		Text.ref,
		List.ref,
		Table.ref,
		Chart.ref,
		Stat.ref,
		Callout.ref,
		Code.ref,
		Image.ref,
		Place.ref,
		LinkButton.ref,
		CopyButton.ref,
		FollowUp.ref,
	]),
);
const Col = component("Col", "Root: the answer's sections, top to bottom", { children });

const library = createLibrary({
	root: "Col",
	components: [Col, Title, Text, List, Table, Chart, Stat, Callout, Code, Image, Place, LinkButton, CopyButton, FollowUp],
});
const parser = createParser(library.toJSONSchema());

export const richPrompt = library.prompt({
	preamble:
		"You may add structured UI to an answer with openui-lang. Answer in Markdown as usual. " +
		"When structure genuinely helps (comparisons, numbers, steps, places, links, commands), also add exactly one fenced " +
		"```openui-lang block. Text outside the block is shown as is. Skip the block for short or conversational answers.",
	additionalRules: [
		"Never repeat in the block what the text already says; the text can be one short sentence when the block carries the answer.",
		"Offer 1-3 FollowUp questions when a natural next question exists.",
		"Use Chart only for real numbers you are confident about.",
	],
});

export type RichAction =
	| { kind: "open"; label: string; url: string }
	| { kind: "copy"; label: string; text: string }
	| { kind: "ask"; question: string };

export type Rendered = { markdown: string; actions: RichAction[] };

const FENCE = /```openui-lang[^\n]*\n([\s\S]*?)(?:```|$)/;

const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const str = (v: unknown) => (typeof v === "string" ? v : "");

function table(columns: unknown[], rows: unknown[][]): string {
	if (!columns.length) return "";
	const head = `| ${columns.map(cell).join(" | ")} |\n|${columns.map(() => " --- |").join("")}`;
	return [head, ...rows.map((r) => `| ${columns.map((_, i) => cell(r?.[i])).join(" | ")} |`)].join("\n");
}

function renderNode(node: ElementNode, actions: RichAction[]): string {
	const p = node.props as Record<string, any>;
	switch (node.typeName) {
		case "Col":
			return ((p.children ?? []) as (ElementNode | null)[])
				.filter((c): c is ElementNode => !!c)
				.map((c) => renderNode(c, actions))
				.filter(Boolean)
				.join("\n\n");
		case "Title":
			return p.text ? `### ${p.text}` : "";
		case "Text":
			return str(p.text);
		case "List":
			return ((p.items ?? []) as unknown[]).map((item, i) => `${p.ordered ? `${i + 1}.` : "-"} ${str(item)}`).join("\n");
		case "Table":
			return table(p.columns ?? [], p.rows ?? []);
		case "Chart": {
			const values = ((p.values ?? []) as unknown[]).map(Number);
			const max = Math.max(...values.filter(Number.isFinite), 0);
			const rows = ((p.labels ?? []) as unknown[]).map((label, i) => {
				const v = values[i];
				const bar = Number.isFinite(v) && max > 0 ? "█".repeat(Math.max(1, Math.round((v / max) * 20))) : "";
				return [label, `${v ?? ""}${p.unit ? ` ${p.unit}` : ""}`, bar];
			});
			return `**${str(p.title)}**\n\n${table(["", "Value", ""], rows)}`;
		}
		case "Stat":
			return `**${str(p.value)}** — ${str(p.label)}`;
		case "Callout": {
			const icon = p.tone === "warning" ? "⚠️" : p.tone === "tip" ? "💡" : "ℹ️";
			return `> ${icon} ${str(p.text).replace(/\n/g, "\n> ")}`;
		}
		case "Code":
			return p.code ? `\`\`\`${str(p.language)}\n${str(p.code)}\n\`\`\`` : "";
		case "Image":
			return /^https:\/\//.test(str(p.url)) ? `![${str(p.alt)}](${p.url})` : "";
		case "Place":
			if (!p.name) return "";
			actions.push({ kind: "open", label: `Open ${p.name} in Maps`, url: mapsUrl(p.name) });
			return `📍 [${p.name}](${mapsUrl(p.name)})${p.note ? ` — ${p.note}` : ""}`;
		case "LinkButton":
			if (!/^https?:\/\//.test(str(p.url))) return "";
			actions.push({ kind: "open", label: str(p.label) || p.url, url: p.url });
			return `[${str(p.label) || p.url}](${p.url})`;
		case "CopyButton":
			if (p.text) actions.push({ kind: "copy", label: str(p.label) || "Copy", text: str(p.text) });
			return "";
		case "FollowUp":
			if (p.question) actions.push({ kind: "ask", question: str(p.question) });
			return "";
		default:
			return "";
	}
}

/** Renders an answer: text outside the openui-lang block as is, the block as Markdown plus actions. */
export function renderAnswer(raw: string): Rendered {
	const match = raw.match(FENCE);
	if (!match) return { markdown: raw, actions: [] };
	const actions: RichAction[] = [];
	let block = "";
	try {
		const root = parser.parse(match[1]).root;
		block = root ? renderNode(root, actions) : "";
	} catch {
		// A malformed block falls back to showing its source.
		block = `\`\`\`\n${match[1]}\n\`\`\``;
	}
	const followUps = actions.filter((a) => a.kind === "ask");
	const suggestions = followUps.length ? `\n\n**Ask next:** ${followUps.map((a) => `_${a.question}_`).join(" · ")}` : "";
	const markdown = raw
		.replace(match[0], () => `\n\n${block}${suggestions}\n\n`)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return { markdown, actions };
}
