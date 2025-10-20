[@concept-design-overview](../../background/concept-design-overview.md)

[@concept-specifications](../../background/concept-specifications.md)

[@implementing-concepts](../../background/implementing-concepts.md)

[@specification](specification.md)

# implement: Messaging
# response:

```typescript
import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

/**
 * # concept: Messaging
 *
 * **purpose**: lets reader talk directly in private chats or groups
 * **principle**: Once users connect through matching or browsing profiles, they can stat a private conversation chats store message history until users leave or are blocked
 */
// Declare collection prefix, use concept name
const PREFIX = "Messaging" + ".";

// Generic types of this concept
type User = ID;
type Chat = ID;
type Message = ID;
type Text = string; // Text is represented as a string

/**
 * a set of Chats with
 *   a set of participants of type User
 *   a set of messages of type Message
 */
interface ChatDoc {
  _id: Chat;
  participants: User[];
  messages: Message[]; // Stores Message IDs
}

/**
 * a set of Messages with
 *   an author of type User
 *   a body of type Text
 */
interface MessageDoc {
  _id: Message;
  author: User;
  body: Text;
  timestamp: Date; // Added for completeness, useful for messaging
}

/**
 * a set of Blocks with
 *   a blocker of type User
 *   a blocked of type User
 */
interface BlockDoc {
  _id: ID; // Unique ID for the block entry
  blocker: User;
  blocked: User;
}

export default class MessagingConcept {
  chats: Collection<ChatDoc>;
  messages: Collection<MessageDoc>; // Note: Messages are stored as sub-documents in ChatDoc, but we'll manage them here for independent ID generation and direct access if needed.
  blocks: Collection<BlockDoc>;

  constructor(private readonly db: Db) {
    this.chats = this.db.collection(PREFIX + "chats");
    this.messages = this.db.collection(PREFIX + "messages"); // Not strictly necessary if messages are fully embedded, but good for consistent ID creation and potential future query patterns
    this.blocks = this.db.collection(PREFIX + "blocks");
  }

  /**
   * **action**: startChat
   *
   * **requires**: at least 2 participants and owner is a participant and there is no blocked pair among any of the participants
   * **effects**: create a new Chat with participants and an empty messages list. Return the chat
   */
  async startChat(
    { creator, participants }: { creator: User; participants: User[] },
  ): Promise<{ chat: Chat } | { error: string }> {
    // Requires: at least 2 participants
    const uniqueParticipants = Array.from(new Set(participants));
    if (uniqueParticipants.length < 2) {
      return { error: "Chat must have at least 2 unique participants." };
    }

    // Requires: owner is a participant
    if (!uniqueParticipants.includes(creator)) {
      return { error: "Creator must be one of the participants." };
    }

    // Requires: no blocked pair among any of the participants
    for (let i = 0; i < uniqueParticipants.length; i++) {
      for (let j = i + 1; j < uniqueParticipants.length; j++) {
        const u1 = uniqueParticipants[i];
        const u2 = uniqueParticipants[j];

        const existingBlock = await this.blocks.findOne({
          $or: [
            { blocker: u1, blocked: u2 },
            { blocker: u2, blocked: u1 },
          ],
        });
        if (existingBlock) {
          return {
            error: `Cannot start chat: A block exists between ${u1} and ${u2}.`,
          };
        }
      }
    }

    // Effects: create a new Chat with participants and an empty messages list.
    const chatId = freshID() as Chat;
    const newChat: ChatDoc = {
      _id: chatId,
      participants: uniqueParticipants,
      messages: [],
    };

    await this.chats.insertOne(newChat);

    // Return the chat
    return { chat: chatId };
  }

  /**
   * **action**: sendMessage
   *
   * **requires**: chat exists and author is a participant in the chat
   * **effects**: append a new message to the chat's message list. Return the new message
   */
  async sendMessage(
    { chat, author, body }: { chat: Chat; author: User; body: Text },
  ): Promise<{ message: Message } | { error: string }> {
    // Requires: chat exists
    const existingChat = await this.chats.findOne({ _id: chat });
    if (!existingChat) {
      return { error: `Chat with ID ${chat} not found.` };
    }

    // Requires: author is a participant in the chat
    if (!existingChat.participants.includes(author)) {
      return { error: `Author ${author} is not a participant in chat ${chat}.` };
    }

    // Effects: append a new message to the chat's message list.
    const messageId = freshID() as Message;
    const newMessageDoc: MessageDoc = {
      _id: messageId,
      author,
      body,
      timestamp: new Date(),
    };

    await this.messages.insertOne(newMessageDoc); // Insert the message document
    await this.chats.updateOne(
      { _id: chat },
      { $push: { messages: messageId } }, // Store message ID in chat's message list
    );

    // Return the new message
    return { message: messageId };
  }

  /**
   * **action**: leaveChat
   *
   * **requires**: chat exists and leaver is one of the participants
   * **effects**: remove leaver from the chat's participants
   */
  async leaveChat(
    { chat, leaver }: { chat: Chat; leaver: User },
  ): Promise<Empty | { error: string }> {
    // Requires: chat exists
    const existingChat = await this.chats.findOne({ _id: chat });
    if (!existingChat) {
      return { error: `Chat with ID ${chat} not found.` };
    }

    // Requires: leaver is one of the participants
    if (!existingChat.participants.includes(leaver)) {
      return { error: `User ${leaver} is not a participant in chat ${chat}.` };
    }

    // Effects: remove leaver from the chat's participants
    await this.chats.updateOne(
      { _id: chat },
      { $pull: { participants: leaver } },
    );

    // Optionally, if a chat has < 2 participants after a leaver, it might be considered defunct.
    // The current spec doesn't require deletion, so we'll just remove the participant.
    // If further action (like chat deletion) were desired, it would be added here.

    return {};
  }

  /**
   * **action**: blockUser
   *
   * **requires**: requester is not the target and a block does not already exist
   * **effects**: create a new Block with blocker = requester and blocked = target.
   *              Remove requester from any chats containing both them and the target.
   */
  async blockUser(
    { requester, target }: { requester: User; target: User },
  ): Promise<Empty | { error: string }> {
    // Requires: requester is not the target
    if (requester === target) {
      return { error: "Cannot block yourself." };
    }

    // Requires: a block does not already exist
    const existingBlock = await this.blocks.findOne({
      blocker: requester,
      blocked: target,
    });
    if (existingBlock) {
      return { error: `User ${requester} has already blocked ${target}.` };
    }

    // Effects: create a new Block with blocker = requester and blocked = target.
    const blockId = freshID() as ID;
    const newBlock: BlockDoc = { _id: blockId, blocker: requester, blocked: target };
    await this.blocks.insertOne(newBlock);

    // Effects: Remove requester from any chats containing both them and the target.
    // Find chats where both requester and target are participants
    const chatsToUpdate = await this.chats
      .find({
        participants: { $all: [requester, target] },
      })
      .toArray();

    // For each such chat, remove the requester from participants
    for (const chat of chatsToUpdate) {
      await this.chats.updateOne(
        { _id: chat._id },
        { $pull: { participants: requester } },
      );
    }

    return {};
  }

  /**
   * **query**: _getChatMessages
   *
   * **effects**: Returns the full message documents for a given chat, ordered by timestamp.
   */
  async _getChatMessages(
    { chat }: { chat: Chat },
  ): Promise<{ messages: MessageDoc[] } | { error: string }> {
    const chatDoc = await this.chats.findOne({ _id: chat });
    if (!chatDoc) {
      return { error: `Chat with ID ${chat} not found.` };
    }

    const messageDocs = await this.messages
      .find({ _id: { $in: chatDoc.messages } })
      .sort({ timestamp: 1 }) // Order by timestamp
      .toArray();

    // Ensure messages are returned in the order they appear in the chat's `messages` array,
    // which implicitly means chronological order if appended sequentially.
    // If `sort` above is not enough, manual sorting based on `chatDoc.messages` array order would be needed.
    // For simplicity, `timestamp` sort is assumed sufficient here if messages are inserted chronologically.

    return { messages: messageDocs };
  }

  /**
   * **query**: _getChatsForUser
   *
   * **effects**: Returns a list of chat IDs where the user is a participant.
   */
  async _getChatsForUser(
    { user }: { user: User },
  ): Promise<{ chats: Chat[] } | { error: string }> {
    const userChats = await this.chats
      .find({ participants: user })
      .project({ _id: 1 }) // Only return the chat ID
      .toArray();

    return { chats: userChats.map((c) => c._id) };
  }

  /**
   * **query**: _isBlocked
   *
   * **effects**: Returns true if requester has blocked target.
   */
  async _isBlocked(
    { requester, target }: { requester: User; target: User },
  ): Promise<{ isBlocked: boolean }> {
    const block = await this.blocks.findOne({ blocker: requester, blocked: target });
    return { isBlocked: !!block };
  }
}
```