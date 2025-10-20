import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "../../utils/types.ts"; // Adjust path as needed
import { freshID } from "../../utils/database.ts"; // Adjust path as needed

// Declare collection prefix, use concept name
const PREFIX = "Commentary" + ".";

// Generic types of this concept
type Book = ID;
type Section = ID;
type User = ID;
type Text = string; // Assuming Text is a string for simplicity
type ReactionType = string; // Assuming ReactionType is a string for simplicity
type Comment = ID;
type Reaction = ID;
type Thread = ID;

/**
 * A set of Threads with
 *   a book of type Book
 *   a section of type Section
 *   a set of Comments (represented by topLevelCommentIds)
 */
interface ThreadDoc {
  _id: Thread;
  book: Book;
  section: Section;
  topLevelCommentIds: Comment[]; // IDs of comments that are direct children of this thread
}

/**
 * A set of Comments with
 *   a author of type User
 *   a body of type Text
 *   an optional parent of type Comment
 *   a threadId: Thread (explicit link to its thread)
 *   a set of Reactions (represented by reactionIds)
 */
interface CommentDoc {
  _id: Comment;
  author: User;
  body: Text;
  threadId: Thread; // The thread this comment belongs to
  parentId?: Comment; // Optional, for replies
  reactionIds: Reaction[]; // IDs of reactions associated with this comment
  // For `deleteComment` to work easily, we might also want to track children or rely on queries.
  // For now, let's keep it simple and rely on querying for children during deletion.
}

/**
 * A set of Reaction with
 *   a reactor of type User
 *   a target of type Comment
 *   a type of type ReactionType
 */
interface ReactionDoc {
  _id: Reaction;
  reactor: User;
  targetCommentId: Comment; // The comment this reaction is for
  type: ReactionType;
}

/**
 * Commentary Concept
 * purpose: Allows readers to comment, reply, and react to parts of a book
 */
export default class CommentaryConcept {
  private threads: Collection<ThreadDoc>;
  private comments: Collection<CommentDoc>;
  private reactions: Collection<ReactionDoc>;

  constructor(private readonly db: Db) {
    this.threads = this.db.collection(PREFIX + "threads");
    this.comments = this.db.collection(PREFIX + "comments");
    this.reactions = this.db.collection(PREFIX + "reactions");
  }

  /**
   * postComment(author: User, book: Book, section: Section, body: Text): (comment: Comment)
   * requires: section belongs to the book (assumed valid IDs by external sync)
   * effects: if Thread already exists for book and section, add a new comment to it.
   *          Else create a new Thread, then add the comment. Return the comment.
   */
  async postComment(
    { author, book, section, body }: {
      author: User;
      book: Book;
      section: Section;
      body: Text;
    },
  ): Promise<{ comment: Comment } | { error: string }> {
    // Find or create the thread for this book and section
    let threadDoc = await this.threads.findOne({ book, section });
    let threadId: Thread;

    if (!threadDoc) {
      threadId = freshID();
      threadDoc = {
        _id: threadId,
        book,
        section,
        topLevelCommentIds: [],
      };
      await this.threads.insertOne(threadDoc);
    } else {
      threadId = threadDoc._id;
    }

    // Create the new comment
    const newCommentId = freshID();
    const newComment: CommentDoc = {
      _id: newCommentId,
      author,
      body,
      threadId,
      reactionIds: [],
    };
    await this.comments.insertOne(newComment);

    // Add the comment ID to the thread's top-level comments
    await this.threads.updateOne(
      { _id: threadId },
      { $push: { topLevelCommentIds: newCommentId } },
    );

    return { comment: newCommentId };
  }

  /**
   * reply(author: Author, parent: Comment, body; Text): (comment: Comment)
   * requires: parent exists
   * effects: create a new Comment with parent = parent in the same thread as the parent. Return the comment
   */
  async reply(
    { author, parent, body }: { author: User; parent: Comment; body: Text },
  ): Promise<{ comment: Comment } | { error: string }> {
    const parentComment = await this.comments.findOne({ _id: parent });
    if (!parentComment) {
      return { error: `Parent comment with ID ${parent} not found.` };
    }

    const newCommentId = freshID();
    const newComment: CommentDoc = {
      _id: newCommentId,
      author,
      body,
      threadId: parentComment.threadId, // Associate with the parent's thread
      parentId: parent,
      reactionIds: [],
    };
    await this.comments.insertOne(newComment);

    // Unlike top-level comments, replies aren't directly added to thread.topLevelCommentIds.
    // They are linked via `parentId`. The query for all comments in a thread will retrieve them.

    return { comment: newCommentId };
  }

  /**
   * react(reactor: User, target: Comment, type: ReactionType): (reaction: Reaction)
   * requires: target exists and there's no existing reaction with (reactor, target, type)
   * effects: creates a new Reaction with reactor, target and type, then attaches it to target. Return the reaction
   */
  async react(
    { reactor, target, type }: {
      reactor: User;
      target: Comment;
      type: ReactionType;
    },
  ): Promise<{ reaction: Reaction } | { error: string }> {
    const targetComment = await this.comments.findOne({ _id: target });
    if (!targetComment) {
      return { error: `Target comment with ID ${target} not found.` };
    }

    // Check for existing reaction by the same reactor, on the same target, with the same type
    const existingReaction = await this.reactions.findOne({
      reactor,
      targetCommentId: target,
      type,
    });
    if (existingReaction) {
      return {
        error: `User ${reactor} already reacted with type ${type} to comment ${target}.`,
      };
    }

    const newReactionId = freshID();
    const newReaction: ReactionDoc = {
      _id: newReactionId,
      reactor,
      targetCommentId: target,
      type,
    };
    await this.reactions.insertOne(newReaction);

    // Attach reaction ID to the target comment
    await this.comments.updateOne(
      { _id: target },
      { $push: { reactionIds: newReactionId } },
    );

    return { reaction: newReactionId };
  }

  /**
   * deleteComment(requestor: User, target: Comment)
   * requires: target exists and requestor is the author of the target
   * effects: remove target and all its descendant replies for its Thread
   */
  async deleteComment(
    { requestor, target }: { requestor: User; target: Comment },
  ): Promise<Empty | { error: string }> {
    const targetComment = await this.comments.findOne({ _id: target });
    if (!targetComment) {
      return { error: `Comment with ID ${target} not found.` };
    }
    if (targetComment.author !== requestor) {
      return { error: `Requestor is not the author of comment ${target}.` };
    }

    // Find all descendant comments (replies)
    const commentsToDelete: Comment[] = [target];
    let queue: Comment[] = [target];

    while (queue.length > 0) {
      const currentCommentId = queue.shift()!;
      const directChildren = await this.comments.find({
        parentId: currentCommentId,
      }).toArray();
      for (const child of directChildren) {
        commentsToDelete.push(child._id);
        queue.push(child._id);
      }
    }

    // Delete all associated reactions for the comments being deleted
    await this.reactions.deleteMany({ targetCommentId: { $in: commentsToDelete } });

    // Delete the comments
    await this.comments.deleteMany({ _id: { $in: commentsToDelete } });

    // If the target comment was a top-level comment, remove it from the thread
    if (!targetComment.parentId) {
      await this.threads.updateOne(
        { _id: targetComment.threadId },
        { $pull: { topLevelCommentIds: target } },
      );
    }
    // Note: If a thread becomes empty of top-level comments, it might be desirable to delete the thread too.
    // This isn't explicitly in the spec but could be an implicit part of "remove ... for its Thread"
    // For now, let's keep the thread document, just removing the comment from its topLevelCommentIds.

    return {};
  }

  // --- Queries ---

  /**
   * _getThreadComments(book: Book, section: Section): (comments: CommentDoc[])
   * effects: Returns all comments (including replies) for a given book and section, structured hierarchically.
   *          This is a more complex query, potentially combining data from threads and comments.
   *          For simplicity here, we'll return all comments associated with the thread.
   *          A true hierarchical structure would need client-side processing or more complex aggregation.
   */
  async _getThreadComments(
    { book, section }: { book: Book; section: Section },
  ): Promise<{ comments: CommentDoc[] } | { error: string }> {
    const threadDoc = await this.threads.findOne({ book, section });
    if (!threadDoc) {
      return { comments: [] }; // No thread, no comments
    }

    const comments = await this.comments.find({ threadId: threadDoc._id }).toArray();
    return { comments };
  }

  /**
   * _getCommentReactions(comment: Comment): (reactions: ReactionDoc[])
   * effects: Returns all reactions for a specific comment.
   */
  async _getCommentReactions(
    { comment }: { comment: Comment },
  ): Promise<{ reactions: ReactionDoc[] } | { error: string }> {
    const reactions = await this.reactions.find({ targetCommentId: comment }).toArray();
    return { reactions };
  }

  /**
   * _getComment(commentId: Comment): (comment: CommentDoc)
   * effects: Returns a specific comment by its ID.
   */
  async _getComment(
    { commentId }: { commentId: Comment },
  ): Promise<{ comment: CommentDoc | null } | { error: string }> {
    const comment = await this.comments.findOne({ _id: commentId });
    return { comment };
  }

  /**
   * _getThreadByBookAndSection(book: Book, section: Section): (thread: ThreadDoc)
   * effects: Returns a specific thread by its book and section.
   */
  async _getThreadByBookAndSection(
    { book, section }: { book: Book; section: Section },
  ): Promise<{ thread: ThreadDoc | null } | { error: string }> {
    const thread = await this.threads.findOne({ book, section });
    return { thread };
  }
}