import { Collection, Db } from "npm:mongodb";
import { assertEquals, assertExists, assertFalse, assertTrue } from "jsr:@std/assert";
import { testDb, freshID } from "@utils/database.ts";
import { ID, Empty } from "@utils/types.ts";
import MessagingConcept from "./MessagingConcept.ts";

// Generic types for consistency with the concept definition
type User = ID;
type Chat = ID;
type Message = ID;
type Text = string;

// Helper to cast strings to ID for testing
const asID = (s: string) => s as ID;

Deno.test("Messaging Concept Tests", async (t) => {
  let db: Db;
  let client: Deno.Closer;
  let concept: MessagingConcept;

  const userAlice = asID("user:Alice");
  const userBob = asID("user:Bob");
  const userCharlie = asID("user:Charlie");
  const userDavid = asID("user:David");

  Deno.test.beforeEach(async () => {
    [db, client] = await testDb();
    concept = new MessagingConcept(db);
  });

  Deno.test.afterEach(async () => {
    await client.close();
  });

  await t.step("startChat action", async (t) => {
    await t.step("should create a chat with valid participants and creator", async () => {
      const result = await concept.startChat({
        creator: userAlice,
        participants: [userAlice, userBob],
      });

      assertExists((result as { chat: Chat }).chat);
      const chatId = (result as { chat: Chat }).chat;

      const chat = await concept.chats.findOne({ _id: chatId });
      assertExists(chat);
      assertEquals(chat.participants.sort(), [userAlice, userBob].sort());
      assertEquals(chat.messages.length, 0);
    });

    await t.step("should return an error if less than 2 unique participants", async () => {
      let result = await concept.startChat({ creator: userAlice, participants: [] });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, "Chat must have at least 2 unique participants.");

      result = await concept.startChat({ creator: userAlice, participants: [userAlice] });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, "Chat must have at least 2 unique participants.");

      result = await concept.startChat({ creator: userAlice, participants: [userAlice, userAlice] });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, "Chat must have at least 2 unique participants."); // Alice counts as one unique participant.
    });

    await t.step("should return an error if creator is not a participant", async () => {
      const result = await concept.startChat({
        creator: userAlice,
        participants: [userBob, userCharlie],
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, "Creator must be one of the participants.");
    });

    await t.step("should return an error if a blocked pair exists among participants", async () => {
      // Alice blocks Bob
      await concept.blockUser({ requester: userAlice, target: userBob });

      const result = await concept.startChat({
        creator: userAlice,
        participants: [userAlice, userBob, userCharlie],
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Cannot start chat: A block exists between ${userAlice} and ${userBob}.`);
    });

    await t.step("should handle multiple participants correctly", async () => {
      const result = await concept.startChat({
        creator: userAlice,
        participants: [userAlice, userBob, userCharlie],
      });
      assertExists((result as { chat: Chat }).chat);
      const chatId = (result as { chat: Chat }).chat;

      const chat = await concept.chats.findOne({ _id: chatId });
      assertExists(chat);
      assertEquals(chat.participants.sort(), [userAlice, userBob, userCharlie].sort());
    });
  });

  await t.step("sendMessage action", async (t) => {
    let chatResult = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userBob],
    });
    const chatId = (chatResult as { chat: Chat }).chat;

    await t.step("should send a message to an existing chat with a participant author", async () => {
      const messageBody = "Hello Bob!";
      const result = await concept.sendMessage({
        chat: chatId,
        author: userAlice,
        body: messageBody,
      });

      assertExists((result as { message: Message }).message);
      const messageId = (result as { message: Message }).message;

      const chat = await concept.chats.findOne({ _id: chatId });
      assertExists(chat);
      assertTrue(chat.messages.includes(messageId));

      const messageDoc = await concept.messages.findOne({ _id: messageId });
      assertExists(messageDoc);
      assertEquals(messageDoc.author, userAlice);
      assertEquals(messageDoc.body, messageBody);
    });

    await t.step("should return an error if chat does not exist", async () => {
      const nonExistentChat = freshID() as Chat;
      const result = await concept.sendMessage({
        chat: nonExistentChat,
        author: userAlice,
        body: "Message for non-existent chat",
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Chat with ID ${nonExistentChat} not found.`);
    });

    await t.step("should return an error if author is not a participant in the chat", async () => {
      const messageBody = "Hello everyone!";
      const result = await concept.sendMessage({
        chat: chatId,
        author: userCharlie, // Charlie is not in this chat
        body: messageBody,
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Author ${userCharlie} is not a participant in chat ${chatId}.`);
    });
  });

  await t.step("leaveChat action", async (t) => {
    let chatResult = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userBob, userCharlie],
    });
    const chatId = (chatResult as { chat: Chat }).chat;

    await t.step("should remove leaver from chat participants", async () => {
      const result = await concept.leaveChat({ chat: chatId, leaver: userBob });
      assertFalse((result as { error: string }).error);

      const chat = await concept.chats.findOne({ _id: chatId });
      assertExists(chat);
      assertFalse(chat.participants.includes(userBob));
      assertTrue(chat.participants.includes(userAlice));
      assertTrue(chat.participants.includes(userCharlie));
    });

    await t.step("should return an error if chat does not exist", async () => {
      const nonExistentChat = freshID() as Chat;
      const result = await concept.leaveChat({
        chat: nonExistentChat,
        leaver: userAlice,
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Chat with ID ${nonExistentChat} not found.`);
    });

    await t.step("should return an error if leaver is not a participant", async () => {
      const result = await concept.leaveChat({
        chat: chatId,
        leaver: userDavid, // David is not in this chat
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userDavid} is not a participant in chat ${chatId}.`);
    });
  });

  await t.step("blockUser action", async (t) => {
    await t.step("should create a block and remove requester from relevant chats", async () => {
      // Create a chat with Alice, Bob, Charlie
      const chat1Result = await concept.startChat({
        creator: userAlice,
        participants: [userAlice, userBob, userCharlie],
      });
      const chat1Id = (chat1Result as { chat: Chat }).chat;

      // Create another chat with Bob, Charlie, David (without Alice)
      const chat2Result = await concept.startChat({
        creator: userBob,
        participants: [userBob, userCharlie, userDavid],
      });
      const chat2Id = (chat2Result as { chat: Chat }).chat;

      // Alice blocks Bob
      const result = await concept.blockUser({ requester: userAlice, target: userBob });
      assertFalse((result as { error: string }).error);

      // Verify block exists
      const block = await concept.blocks.findOne({
        blocker: userAlice,
        blocked: userBob,
      });
      assertExists(block);

      // Verify Alice is removed from chat1 (contains both Alice and Bob)
      const chat1 = await concept.chats.findOne({ _id: chat1Id });
      assertExists(chat1);
      assertFalse(chat1.participants.includes(userAlice));
      assertTrue(chat1.participants.includes(userBob)); // Bob should still be there
      assertTrue(chat1.participants.includes(userCharlie));

      // Verify chat2 is unaffected (does not contain Alice)
      const chat2 = await concept.chats.findOne({ _id: chat2Id });
      assertExists(chat2);
      assertTrue(chat2.participants.includes(userBob));
      assertTrue(chat2.participants.includes(userCharlie));
      assertTrue(chat2.participants.includes(userDavid));
    });

    await t.step("should return an error if requester tries to block self", async () => {
      const result = await concept.blockUser({
        requester: userAlice,
        target: userAlice,
      });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, "Cannot block yourself.");
    });

    await t.step("should return an error if block already exists", async () => {
      await concept.blockUser({ requester: userAlice, target: userBob }); // First block
      const result = await concept.blockUser({ requester: userAlice, target: userBob }); // Second block
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userAlice} has already blocked ${userBob}.`);
    });
  });

  await t.step("Principle Trace: users connect, start private conversation, store message history, handle leaving/blocking", async () => {
    // 1. Users connect (implicitly by deciding to chat) -> startChat
    const chatResult = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userBob],
    });
    const chatId = (chatResult as { chat: Chat }).chat;
    assertExists(chatId, "Chat should be created.");

    // 2. They can start a private conversation -> sendMessage
    const msg1Result = await concept.sendMessage({
      chat: chatId,
      author: userAlice,
      body: "Hey Bob, how are you?",
    });
    const msg1Id = (msg1Result as { message: Message }).message;
    assertExists(msg1Id, "First message should be sent.");

    const msg2Result = await concept.sendMessage({
      chat: chatId,
      author: userBob,
      body: "I'm good, Alice! You?",
    });
    const msg2Id = (msg2Result as { message: Message }).message;
    assertExists(msg2Id, "Second message should be sent.");

    // 3. Chats store message history -> _getChatMessages
    const messagesQueryResult = await concept._getChatMessages({ chat: chatId });
    assertFalse((messagesQueryResult as { error: string }).error, "Should retrieve messages without error.");
    const messages = (messagesQueryResult as { messages: any[] }).messages;
    assertEquals(messages.length, 2, "Chat should contain 2 messages.");
    assertEquals(messages[0]._id, msg1Id, "First message ID should match.");
    assertEquals(messages[1]._id, msg2Id, "Second message ID should match.");
    assertEquals(messages[0].author, userAlice);
    assertEquals(messages[1].author, userBob);

    // 4. Until users leave or are blocked
    // Scenario A: User leaves
    await concept.leaveChat({ chat: chatId, leaver: userBob });
    const chatAfterLeave = await concept.chats.findOne({ _id: chatId });
    assertExists(chatAfterLeave);
    assertFalse(chatAfterLeave.participants.includes(userBob), "Bob should no longer be a participant.");
    assertTrue(chatAfterLeave.participants.includes(userAlice), "Alice should still be a participant.");

    // Bob tries to send a message after leaving, should fail
    const bobTrySend = await concept.sendMessage({ chat: chatId, author: userBob, body: "I'm still here!" });
    assertExists((bobTrySend as { error: string }).error, "Bob should not be able to send message after leaving.");
    assertEquals((bobTrySend as { error: string }).error, `Author ${userBob} is not a participant in chat ${chatId}.`);

    // Scenario B: User blocks another
    // Re-create a chat for blocking scenario
    const chat2Result = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userCharlie],
    });
    const chat2Id = (chat2Result as { chat: Chat }).chat;
    assertExists(chat2Id, "Second chat should be created.");

    await concept.sendMessage({ chat: chat2Id, author: userAlice, body: "Hi Charlie" });
    await concept.sendMessage({ chat: chat2Id, author: userCharlie, body: "Hello Alice" });

    // Alice blocks Charlie
    await concept.blockUser({ requester: userAlice, target: userCharlie });
    const isBlocked = await concept._isBlocked({ requester: userAlice, target: userCharlie });
    assertTrue(isBlocked.isBlocked, "Alice should have blocked Charlie.");

    const chatAfterBlock = await concept.chats.findOne({ _id: chat2Id });
    assertExists(chatAfterBlock);
    assertFalse(chatAfterBlock.participants.includes(userAlice), "Alice should be removed from chat with Charlie.");
    assertTrue(chatAfterBlock.participants.includes(userCharlie), "Charlie should still be in the chat (Alice removed, not Charlie).");

    // Alice tries to send a message to the chat she was removed from (due to block), should fail
    const aliceTrySend = await concept.sendMessage({ chat: chat2Id, author: userAlice, body: "Are you there Charlie?" });
    assertExists((aliceTrySend as { error: string }).error, "Alice should not be able to send message after being removed from chat due to block.");
    assertEquals((aliceTrySend as { error: string }).error, `Author ${userAlice} is not a participant in chat ${chat2Id}.`);

    // Charlie tries to send a message in the chat, should succeed (as only Alice was removed)
    const charlieTrySend = await concept.sendMessage({ chat: chat2Id, author: userCharlie, body: "Alice, why did you leave?" });
    assertExists((charlieTrySend as { message: Message }).message, "Charlie should still be able to send message in chat.");
  });

  await t.step("Query _getChatMessages", async (t) => {
    const chatResult = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userBob],
    });
    const chatId = (chatResult as { chat: Chat }).chat;

    await concept.sendMessage({ chat: chatId, author: userAlice, body: "First message" });
    await concept.sendMessage({ chat: chatId, author: userBob, body: "Second message" });
    await concept.sendMessage({ chat: chatId, author: userAlice, body: "Third message" });

    await t.step("should return all messages for a given chat in chronological order", async () => {
      const messagesResult = await concept._getChatMessages({ chat: chatId });
      assertFalse((messagesResult as { error: string }).error);
      const messages = (messagesResult as { messages: any[] }).messages;

      assertEquals(messages.length, 3);
      assertEquals(messages[0].body, "First message");
      assertEquals(messages[1].body, "Second message");
      assertEquals(messages[2].body, "Third message");
    });

    await t.step("should return an error if chat does not exist", async () => {
      const nonExistentChat = freshID() as Chat;
      const messagesResult = await concept._getChatMessages({ chat: nonExistentChat });
      assertExists((messagesResult as { error: string }).error);
      assertEquals((messagesResult as { error: string }).error, `Chat with ID ${nonExistentChat} not found.`);
    });
  });

  await t.step("Query _getChatsForUser", async (t) => {
    // Create chat1 with Alice and Bob
    const chat1Result = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userBob],
    });
    const chat1Id = (chat1Result as { chat: Chat }).chat;

    // Create chat2 with Alice and Charlie
    const chat2Result = await concept.startChat({
      creator: userAlice,
      participants: [userAlice, userCharlie],
    });
    const chat2Id = (chat2Result as { chat: Chat }).chat;

    // Create chat3 with Bob and Charlie (no Alice)
    await concept.startChat({
      creator: userBob,
      participants: [userBob, userCharlie],
    });

    await t.step("should return all chat IDs a user is a participant in", async () => {
      const aliceChatsResult = await concept._getChatsForUser({ user: userAlice });
      assertFalse((aliceChatsResult as { error: string }).error);
      const aliceChats = (aliceChatsResult as { chats: Chat[] }).chats;
      assertEquals(aliceChats.length, 2);
      assertTrue(aliceChats.includes(chat1Id));
      assertTrue(aliceChats.includes(chat2Id));

      const bobChatsResult = await concept._getChatsForUser({ user: userBob });
      assertFalse((bobChatsResult as { error: string }).error);
      const bobChats = (bobChatsResult as { chats: Chat[] }).chats;
      assertEquals(bobChats.length, 2);
    });

    await t.step("should return an empty array if user is not in any chats", async () => {
      const davidChatsResult = await concept._getChatsForUser({ user: userDavid });
      assertFalse((davidChatsResult as { error: string }).error);
      const davidChats = (davidChatsResult as { chats: Chat[] }).chats;
      assertEquals(davidChats.length, 0);
    });
  });

  await t.step("Query _isBlocked", async (t) => {
    await t.step("should return true if requester has blocked target", async () => {
      await concept.blockUser({ requester: userAlice, target: userBob });
      const result = await concept._isBlocked({ requester: userAlice, target: userBob });
      assertTrue(result.isBlocked);
    });

    await t.step("should return false if requester has not blocked target", async () => {
      const result = await concept._isBlocked({ requester: userAlice, target: userCharlie });
      assertFalse(result.isBlocked);
    });

    await t.step("should return false if target has blocked requester, but not vice-versa", async () => {
      await concept.blockUser({ requester: userBob, target: userAlice }); // Bob blocks Alice
      const result = await concept._isBlocked({ requester: userAlice, target: userBob }); // Alice checks if she blocked Bob
      assertFalse(result.isBlocked);
    });
  });
});