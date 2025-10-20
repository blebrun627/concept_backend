---
timestamp: 'Sun Oct 19 2025 23:31:59 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_233159.277993c8.md]]'
content_id: 5df5d86b01ac2dd3f5312401d12d92dc7279d756586c470f8d9aed99b5723d50
---

# response:

```typescript
// file: src/commentary/CommentaryConcept.test.ts

import { assertEquals, assertNotEquals, assertArrayIncludes, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "../../utils/database.ts"; // Adjust path as needed
import { ID } from "../../utils/types.ts"; // Adjust path as needed
import CommentaryConcept from "./CommentaryConcept.ts";

Deno.test("Commentary Concept Functionality", async (test) => {
  const [db, client] = await testDb();
  const commentary = new CommentaryConcept(db);

  // Define some test data IDs
  const userAlice = "user:Alice" as ID;
  const userBob = "user:Bob" as ID;
  const bookAlpha = "book:Alpha" as ID;
  const sectionIntro = "section:Introduction" as ID;
  const sectionChapter1 = "section:Chapter1" as ID;
  const reactionLike = "like" as ID;
  const reactionLove = "love" as ID;

  // Helper to ensure an action returns a success result, and extract the value
  const expectSuccess = <T>(result: T | { error: string }): T => {
    if ("error" in result) {
      throw new Error(`Expected success, but got error: ${result.error}`);
    }
    return result;
  };

  await test.step("postComment creates a new thread and comment", async () => {
    const postResult = expectSuccess(await commentary.postComment({
      author: userAlice,
      book: bookAlpha,
      section: sectionIntro,
      body: "This is a great intro!",
    }));
    const commentId1 = postResult.comment;

    assertNotEquals(commentId1, undefined);

    const { thread: thread1 } = expectSuccess(await commentary._getThreadByBookAndSection({
      book: bookAlpha,
      section: sectionIntro,
    }));
    assertNotEquals(thread1, null);
    assertEquals(thread1?.book, bookAlpha);
    assertEquals(thread1?.section, sectionIntro);
    assertArrayIncludes(thread1?.topLevelCommentIds || [], [commentId1]);

    const { comment: retrievedComment1 } = expectSuccess(await commentary._getComment({ commentId: commentId1 }));
    assertNotEquals(retrievedComment1, null);
    assertEquals(retrievedComment1?.author, userAlice);
    assertEquals(retrievedComment1?.body, "This is a great intro!");
    assertEquals(retrievedComment1?.threadId, thread1?._id);
    assertEquals(retrievedComment1?.parentId, undefined);
  });

  await test.step("postComment reuses existing thread", async () => {
    const postResult2 = expectSuccess(await commentary.postComment({
      author: userBob,
      book: bookAlpha,
      section: sectionIntro,
      body: "I agree, very insightful.",
    }));
    const commentId2 = postResult2.comment;

    assertNotEquals(commentId2, undefined);

    const { thread: thread1Updated } = expectSuccess(await commentary._getThreadByBookAndSection({
      book: bookAlpha,
      section: sectionIntro,
    }));
    assertNotEquals(thread1Updated, null);
    // Should be the same thread ID as before
    const { thread: thread1Original } = expectSuccess(await commentary._getThreadByBookAndSection({
      book: bookAlpha,
      section: sectionIntro,
    }));
    assertEquals(thread1Updated?._id, thread1Original?._id);
    assertArrayIncludes(thread1Updated?.topLevelCommentIds || [], [commentId2]);
    assertEquals(thread1Updated?.topLevelCommentIds.length, 2); // Now two comments
  });

  let commentId1: ID; // Store for later tests

  await test.step("reply creates a nested comment", async () => {
    // Retrieve commentId1 from previous test's state (assuming ordered execution, or re-post if isolated)
    const { comments: allCommentsBefore } = expectSuccess(await commentary._getThreadComments({ book: bookAlpha, section: sectionIntro }));
    const initialComment = allCommentsBefore.find(c => c.body === "This is a great intro!");
    commentId1 = initialComment!._id;

    const replyResult = expectSuccess(await commentary.reply({
      author: userBob,
      parent: commentId1,
      body: "This is my reply to the first comment.",
    }));
    const replyId1 = replyResult.comment;

    assertNotEquals(replyId1, undefined);

    const { comment: retrievedReply1 } = expectSuccess(await commentary._getComment({ commentId: replyId1 }));
    assertNotEquals(retrievedReply1, null);
    assertEquals(retrievedReply1?.author, userBob);
    assertEquals(retrievedReply1?.body, "This is my reply to the first comment.");
    assertEquals(retrievedReply1?.parentId, commentId1);

    const { comments: threadComments } = expectSuccess(await commentary._getThreadComments({ book: bookAlpha, section: sectionIntro }));
    assertArrayIncludes(threadComments.map(c => c._id), [replyId1]);
    assertEquals(threadComments.length, 3); // 2 top-level + 1 reply
  });

  await test.step("reply fails if parent does not exist", async () => {
    const nonExistentComment = "comment:nonexistent" as ID;
    const replyResult = await commentary.reply({
      author: userAlice,
      parent: nonExistentComment,
      body: "Attempting to reply to nothing.",
    });
    assertObjectMatch(replyResult, { error: `Parent comment with ID ${nonExistentComment} not found.` });
  });

  let reactionId1: ID;

  await test.step("react creates a new reaction on a comment", async () => {
    const reactResult = expectSuccess(await commentary.react({
      reactor: userBob,
      target: commentId1,
      type: reactionLike,
    }));
    reactionId1 = reactResult.reaction;

    assertNotEquals(reactionId1, undefined);

    const { comment: commentWithReaction } = expectSuccess(await commentary._getComment({ commentId: commentId1 }));
    assertNotEquals(commentWithReaction, null);
    assertArrayIncludes(commentWithReaction?.reactionIds || [], [reactionId1]);

    const { reactions: retrievedReactions } = expectSuccess(await commentary._getCommentReactions({ comment: commentId1 }));
    assertEquals(retrievedReactions.length, 1);
    assertEquals(retrievedReactions[0].reactor, userBob);
    assertEquals(retrievedReactions[0].targetCommentId, commentId1);
    assertEquals(retrievedReactions[0].type, reactionLike);
  });

  await test.step("react prevents duplicate reactions by the same user and type on the same target", async () => {
    const reactResult = await commentary.react({
      reactor: userBob,
      target: commentId1,
      type: reactionLike, // Same as before
    });
    assertObjectMatch(reactResult, { error: `User ${userBob} already reacted with type ${reactionLike} to comment ${commentId1}.` });

    // Verify no new reaction was added
    const { reactions: retrievedReactions } = expectSuccess(await commentary._getCommentReactions({ comment: commentId1 }));
    assertEquals(retrievedReactions.length, 1);
  });

  await test.step("react allows different reaction types by the same user on the same target", async () => {
    const reactResult2 = expectSuccess(await commentary.react({
      reactor: userBob,
      target: commentId1,
      type: reactionLove, // Different type
    }));
    const reactionId2 = reactResult2.reaction;
    assertNotEquals(reactionId2, undefined);

    const { reactions: retrievedReactions } = expectSuccess(await commentary._getCommentReactions({ comment: commentId1 }));
    assertEquals(retrievedReactions.length, 2);
    assertArrayIncludes(retrievedReactions.map(r => r.type), [reactionLike, reactionLove]);
  });

  await test.step("react allows same reaction type by different users on the same target", async () => {
    const reactResult3 = expectSuccess(await commentary.react({
      reactor: userAlice, // Different user
      target: commentId1,
      type: reactionLike, // Same type as Bob's first reaction
    }));
    const reactionId3 = reactResult3.reaction;
    assertNotEquals(reactionId3, undefined);

    const { reactions: retrievedReactions } = expectSuccess(await commentary._getCommentReactions({ comment: commentId1 }));
    assertEquals(retrievedReactions.length, 3);
    assertArrayIncludes(retrievedReactions.map(r => r.reactor), [userBob, userAlice]);
  });

  await test.step("react fails if target comment does not exist", async () => {
    const nonExistentComment = "comment:nonexistent" as ID;
    const reactResult = await commentary.react({
      reactor: userAlice,
      target: nonExistentComment,
      type: reactionLike,
    });
    assertObjectMatch(reactResult, { error: `Target comment with ID ${nonExistentComment} not found.` });
  });

  await test.step("deleteComment fails if requestor is not the author", async () => {
    // commentId1 was posted by userAlice
    const deleteResult = await commentary.deleteComment({
      requestor: userBob,
      target: commentId1,
    });
    assertObjectMatch(deleteResult, { error: `Requestor is not the author of comment ${commentId1}.` });

    // Verify comment still exists
    const { comment: commentStillExists } = expectSuccess(await commentary._getComment({ commentId: commentId1 }));
    assertNotEquals(commentStillExists, null);
  });

  await test.step("deleteComment removes a top-level comment and its replies and reactions", async () => {
    // Re-fetch to ensure commentId1 and replyId1 are correct from previous state
    const { comments: allComments } = expectSuccess(await commentary._getThreadComments({ book: bookAlpha, section: sectionIntro }));
    const originalComment1 = allComments.find(c => c.body === "This is a great intro!");
    const replyTo1 = allComments.find(c => c.parentId === originalComment1?._id);
    const topLevelCommentToDelete = originalComment1!._id;
    const replyToDelete = replyTo1!._id;

    assertEquals((expectSuccess(await commentary._getCommentReactions({ comment: topLevelCommentToDelete }))).reactions.length, 3);
    assertEquals((expectSuccess(await commentary._getCommentReactions({ comment: replyToDelete }))).reactions.length, 0); // Assuming no reactions on reply

    // Delete commentId1 (posted by userAlice)
    const deleteResult = expectSuccess(await commentary.deleteComment({
      requestor: userAlice,
      target: topLevelCommentToDelete,
    }));
    assertEquals(deleteResult, {});

    // Verify commentId1 and its reply are deleted
    const { comment: deletedComment1 } = expectSuccess(await commentary._getComment({ commentId: topLevelCommentToDelete }));
    assertEquals(deletedComment1, null);
    const { comment: deletedReply1 } = expectSuccess(await commentary._getComment({ commentId: replyToDelete }));
    assertEquals(deletedReply1, null);

    // Verify associated reactions are deleted
    const { reactions: remainingReactions } = expectSuccess(await commentary._getCommentReactions({ comment: topLevelCommentToDelete }));
    assertEquals(remainingReactions.length, 0);

    // Verify thread's topLevelCommentIds is updated
    const { thread: threadUpdated } = expectSuccess(await commentary._getThreadByBookAndSection({
      book: bookAlpha,
      section: sectionIntro,
    }));
    assertNotEquals(threadUpdated, null);
    assert(!threadUpdated?.topLevelCommentIds.includes(topLevelCommentToDelete));
    assertEquals(threadUpdated?.topLevelCommentIds.length, 1); // Only commentId2 remains
  });

  // Trace to fulfill the principle: "Every section of the book has an associated discussion thread. Users can add comments, reply to others, and leave reactions"
  await test.step("Principle fulfillment trace", async () => {
    // 1. Post a comment
    const postRes1 = expectSuccess(await commentary.postComment({
      author: userAlice,
      book: bookAlpha,
      section: sectionChapter1,
      body: "First comment on Chapter 1.",
    }));
    const chap1Comment1 = postRes1.comment;

    // Verify the comment and thread exist
    const { thread: chap1Thread } = expectSuccess(await commentary._getThreadByBookAndSection({ book: bookAlpha, section: sectionChapter1 }));
    assertNotEquals(chap1Thread, null);
    assertArrayIncludes(chap1Thread?.topLevelCommentIds || [], [chap1Comment1]);

    const { comment: retrievedChap1Comment1 } = expectSuccess(await commentary._getComment({ commentId: chap1Comment1 }));
    assertNotEquals(retrievedChap1Comment1, null);
    assertEquals(retrievedChap1Comment1?.body, "First comment on Chapter 1.");

    // 2. Reply to the comment
    const replyRes1 = expectSuccess(await commentary.reply({
      author: userBob,
      parent: chap1Comment1,
      body: "A thoughtful reply to the first comment.",
    }));
    const chap1Reply1 = replyRes1.comment;

    // Verify the reply exists and is linked to the parent
    const { comment: retrievedChap1Reply1 } = expectSuccess(await commentary._getComment({ commentId: chap1Reply1 }));
    assertNotEquals(retrievedChap1Reply1, null);
    assertEquals(retrievedChap1Reply1?.parentId, chap1Comment1);

    // 3. Leave a reaction on the comment
    const reactRes1 = expectSuccess(await commentary.react({
      reactor: userAlice,
      target: chap1Comment1,
      type: reactionLike,
    }));
    const chap1Reaction1 = reactRes1.reaction;

    // Verify the reaction exists and is linked to the comment
    const { reactions: chap1CommentReactions } = expectSuccess(await commentary._getCommentReactions({ comment: chap1Comment1 }));
    assertNotEquals(chap1CommentReactions.find(r => r._id === chap1Reaction1), undefined);

    // Verify all comments (including reply) are part of the thread query
    const { comments: allChap1Comments } = expectSuccess(await commentary._getThreadComments({ book: bookAlpha, section: sectionChapter1 }));
    assertEquals(allChap1Comments.length, 2); // original comment + 1 reply
    assertArrayIncludes(allChap1Comments.map(c => c._id), [chap1Comment1, chap1Reply1]);
  });

  await client.close();
});
```
