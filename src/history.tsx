import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";
import { deleteConversation, listConversations } from "./store.ts";

export function History(props: { onOpen: (id: string) => void }) {
	const { pop } = useNavigation();
	const [entries, setEntries] = useState<Awaited<ReturnType<typeof listConversations>>>();

	useEffect(() => {
		listConversations().then(setEntries);
	}, []);

	return (
		<List isLoading={!entries} navigationTitle="Ask AI History" searchBarPlaceholder="Search past conversations">
			<List.EmptyView title="No conversations yet" icon={Icon.SpeechBubble} />
			{entries?.map((e) => (
				<List.Item
					key={e.id}
					id={e.id}
					title={e.title || "Untitled"}
					icon={Icon.SpeechBubble}
					accessories={[{ text: new Date(e.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) }]}
					actions={
						<ActionPanel>
							<Action
								title="Open Conversation"
								icon={Icon.ArrowRight}
								onAction={() => {
									props.onOpen(e.id);
									pop();
								}}
							/>
							<Action
								title="Delete Conversation"
								icon={Icon.Trash}
								style={Action.Style.Destructive}
								shortcut={{ modifiers: ["ctrl"], key: "x" }}
								onAction={async () => {
									await deleteConversation(e.id);
									setEntries((list) => list?.filter((x) => x.id !== e.id));
								}}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
