import assert from "node:assert/strict";
import { test } from "node:test";
import { renderAnswer, richPrompt } from "../src/openui.ts";

test("plain answers pass through untouched", () => {
	assert.deepEqual(renderAnswer("Just **text**."), { markdown: "Just **text**.", actions: [] });
});

test("a block renders as Markdown with text around it, buttons become actions", () => {
	const raw = [
		"Here are the options:",
		"```openui-lang",
		"root = Col([t, tbl, ch, pl, go, cp, f1])",
		'tbl = Table(["City", "Price"], [["Lisbon", 120], ["Porto", "90 | cheap"]])',
		't = Title("Weekend trips")',
		'ch = Chart("Nights", ["Lisbon", "Porto"], [4, 2], "nights")',
		'pl = Place("Belém Tower", "Go early")',
		'go = LinkButton("Book", "https://example.com/book")',
		'cp = CopyButton("Copy itinerary", "Day 1: Alfama")',
		'f1 = FollowUp("What about Madeira?")',
		"```",
		"Enjoy.",
	].join("\n");
	const { markdown, actions } = renderAnswer(raw);
	assert.match(markdown, /^Here are the options:\n\n### Weekend trips/);
	assert.match(markdown, /\| City \| Price \|\n\| --- \| --- \|\n\| Lisbon \| 120 \|\n\| Porto \| 90 \\\| cheap \|/);
	assert.match(markdown, /\| Lisbon \| 4 nights \| █{20} \|/);
	assert.match(markdown, /\| Porto \| 2 nights \| █{10} \|/);
	assert.match(markdown, /📍 \[Belém Tower\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Bel%C3%A9m%20Tower\) — Go early/);
	assert.match(markdown, /\*\*Ask next:\*\* _What about Madeira\?_/);
	assert.match(markdown, /Madeira\?_\n\nEnjoy\.$/);
	assert.doesNotMatch(markdown, /openui-lang|root =/);
	assert.deepEqual(
		actions.map((a) => a.kind),
		["open", "open", "copy", "ask"],
	);
	assert.deepEqual(actions[1], { kind: "open", label: "Book", url: "https://example.com/book" });
});

test("a block still streaming renders what has arrived", () => {
	const { markdown } = renderAnswer('Sure.\n```openui-lang\nroot = Col([a, b])\na = Title("Hel');
	assert.equal(markdown, "Sure.\n\n### Hel");
});

test("unsafe URLs are dropped", () => {
	const raw = '```openui-lang\nroot = Col([a, b])\na = Image("http://x/y.png", "y")\nb = LinkButton("Run", "javascript:alert(1)")\n```';
	assert.deepEqual(renderAnswer(raw), { markdown: "", actions: [] });
});

test("dollar signs in content survive", () => {
	const { markdown } = renderAnswer('```openui-lang\nroot = Col([a])\na = Stat("Price", "$& $1 $$")\n```');
	assert.equal(markdown, "**$& $1 $$** — Price");
});

test("the prompt teaches the components and the fence", () => {
	for (const name of ["Table(", "Chart(", "Place(", "LinkButton(", "FollowUp(", "```openui-lang"]) assert.ok(richPrompt.includes(name), name);
});
