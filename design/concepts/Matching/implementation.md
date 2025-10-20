[@concept-design-overview](../../background/concept-design-overview.md)

[@concept-specifications](../../background/concept-specifications.md)

[@implementing-concepts](../../background/implementing-concepts.md)

[@specification](specification.md)

# implement: Matching
# response:

```typescript
// file: src/Matching/MatchingConcept.ts
import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "../../utils/types.ts"; // Adjust path as necessary based on your project structure
import { freshID } from "../../utils/database.ts"; // Adjust path as necessary

// Declare collection prefix for MongoDB collections
const PREFIX = "Matching" + ".";

// Generic types for the concept, treated polymorphically
type User = ID;
type Book = ID;
type MatchID = ID; // Unique identifier for a match document

/**
 * @typedef {'pending' | 'accepted' | 'rejected'} Status
 * The lifecycle status of a match:
 * - 'pending': A match has been generated, awaiting acceptance from users.
 * - 'accepted': At least one user has accepted the match. For a match to be fully 'active'
 *               for both users, both would typically need to accept it (this specific detail
 *               can be managed by syncs or a more complex status).
 * - 'rejected': At least one user has rejected the match, rendering it inactive.
 */
type Status = "pending" | "accepted" | "rejected";

/**
 * Interface representing a Match document stored in the database.
 * This document connects two users who have shared a common book interest.
 *
 * @property {_id} MatchID - The unique identifier for this match instance.
 * @property {User} userA - The ID of the first user involved in the match.
 * @property {User} userB - The ID of the second user involved in the match.
 * @property {Book} book - The ID of the book that serves as the basis for this match.
 * @property {Status} status - The current status of the match (e.g., pending, accepted, rejected).
 * @property {string} [explanation] - An optional, automatically generated explanation of why the match is relevant.
 */
interface Match {
  _id: MatchID;
  userA: User;
  userB: User;
  book: Book;
  status: Status;
  explanation?: string; // Corresponds to the 'Text' type in the specification
}

/**
 * Interface representing a FinishedBook record.
 * This records when a user marked a specific book as finished.
 *
 * @property {_id} ID - A unique identifier for this finished book record.
 * @property {User} user - The ID of the user who finished the book.
 * @property {Book} book - The ID of the book that was finished.
 * @property {Date} finishedAt - The timestamp when the book was marked as finished.
 */
interface FinishedBook {
  _id: ID; // Could be MongoDB's ObjectId, using ID for consistency as per guidelines
  user: User;
  book: Book;
  finishedAt: Date;
}

/**
 * @concept Matching [User, Book]
 * @purpose Connect readers who recently finished the same book. Optionally use an LLM to explain the match,
 *          generate first-message prompts, or suggest the closest alternatives when exact matches are sparse.
 * @principle When a user finishes a book, the system looks for others who did the same recently.
 *            Users can accept or decline these matches. Accepting a match keeps it active, while rejecting a match deactivates it.
 *            Optionally, the user may ask the system to provide an explanation of a proposed or active match.
 *            If there aren't many co-finishers of a book at a time, a user may request the "next closest candidates",
 *            based on author, sub-genre, themes, or profile overlaps. If AI is unavailable or disabled, matching behavior is unchanged.
 */
export default class MatchingConcept {
  matches: Collection<Match>;
  finishedBooks: Collection<FinishedBook>;

  constructor(private readonly db: Db) {
    // Initialize MongoDB collections with the defined prefix
    this.matches = this.db.collection(PREFIX + "matches");
    this.finishedBooks = this.db.collection(PREFIX + "finishedBooks");
  }

  /**
   * @action generateMatches
   * @description Identifies other users who have recently finished the same book as the owner
   *              and creates new pending match proposals.
   * @param {{ owner: User, book: Book }} args - The owner user ID and the book ID.
   * @requires owner has a Profile (assumed to be managed by a separate Profile concept) and has finished the specified book.
   * @effects Creates new match records in 'pending' status for the owner with each co-finisher.
   *          Existing matches for the same book and user pair are excluded. Returns the list of newly created matches.
   * @returns {Promise<{ suggested: Match[] } | { error: string }>} A promise that resolves to an object
   *          containing an array of the newly suggested Match objects, or an error message.
   */
  async generateMatches(
    { owner, book }: { owner: User; book: Book },
  ): Promise<{ suggested: Match[] } | { error: string }> {
    // 1. Precondition: Check if the owner has finished the book
    const ownerFinishedBook = await this.finishedBooks.findOne({
      user: owner,
      book: book,
    });
    if (!ownerFinishedBook) {
      return { error: `User ${owner} has not finished book ${book}.` };
    }

    // 2. Find all other users who also finished this specific book
    const coFinishers = await this.finishedBooks
      .find({ book: book, user: { $ne: owner } }) // Exclude the owner themselves
      .toArray();

    const newMatches: Match[] = [];

    // 3. Identify existing matches involving the owner and this book
    const existingMatchesForBook = await this.matches
      .find({
        book: book,
        $or: [
          { userA: owner },
          { userB: owner },
        ],
      })
      .toArray();

    // 4. Iterate through co-finishers to create new matches
    for (const coFinisher of coFinishers) {
      const otherUser = coFinisher.user;

      // Check if a match (in either direction) already exists between owner and otherUser for this book
      const alreadyMatched = existingMatchesForBook.some((match) =>
        (match.userA === owner && match.userB === otherUser) ||
        (match.userA === otherUser && match.userB === owner)
      );

      // If no existing match, create a new one
      if (!alreadyMatched) {
        const newMatch: Match = {
          _id: freshID(), // Generate a fresh ID for the new match document
          userA: owner,
          userB: otherUser,
          book: book,
          status: "pending",
        };
        newMatches.push(newMatch);
      }
    }

    // 5. If new matches were generated, insert them into the database
    if (newMatches.length > 0) {
      await this.matches.insertMany(newMatches);
    }

    // 6. Return the newly suggested matches
    return { suggested: newMatches };
  }

  /**
   * @action acceptMatch
   * @description Allows a user to accept a pending match proposal.
   * @param {{ owner: User, matchId: MatchID }} args - The ID of the user accepting and the match ID.
   * @requires The specified match must exist, the owner must be one of the users in the match,
   *           and the match's status must currently be 'pending'.
   * @effects The status of the match will be updated to 'accepted'.
   * @returns {Promise<Empty | { error: string }>} A promise that resolves to an empty object on success,
   *          or an error object if preconditions are not met.
   */
  async acceptMatch(
    { owner, matchId }: { owner: User; matchId: MatchID },
  ): Promise<Empty | { error: string }> {
    // 1. Precondition: Fetch the match and check its existence
    const match = await this.matches.findOne({ _id: matchId });
    if (!match) {
      return { error: `Match ${matchId} not found.` };
    }

    // 2. Precondition: Check if the owner is part of this match
    if (match.userA !== owner && match.userB !== owner) {
      return { error: `User ${owner} is not part of match ${matchId}.` };
    }

    // 3. Precondition: Check if the match is in 'pending' status
    if (match.status !== "pending") {
      return { error: `Match ${matchId} is not in 'pending' status.` };
    }

    // 4. Effect: Update the match status to 'accepted'
    await this.matches.updateOne(
      { _id: matchId },
      { $set: { status: "accepted" } },
    );

    // 5. Return success
    return {};
  }

  /**
   * @action rejectMatch
   * @description Allows a user to reject a match proposal or an active match.
   * @param {{ owner: User, matchId: MatchID }} args - The ID of the user rejecting and the match ID.
   * @requires The specified match must exist and the owner must be one of the users in the match.
   * @effects The status of the match will be updated to 'rejected'.
   * @returns {Promise<Empty | { error: string }>} A promise that resolves to an empty object on success,
   *          or an error object if preconditions are not met.
   */
  async rejectMatch(
    { owner, matchId }: { owner: User; matchId: MatchID },
  ): Promise<Empty | { error: string }> {
    // 1. Precondition: Fetch the match and check its existence
    const match = await this.matches.findOne({ _id: matchId });
    if (!match) {
      return { error: `Match ${matchId} not found.` };
    }

    // 2. Precondition: Check if the owner is part of this match
    if (match.userA !== owner && match.userB !== owner) {
      return { error: `User ${owner} is not part of match ${matchId}.` };
    }

    // 3. Precondition: Ensure the match is not already rejected
    if (match.status === "rejected") {
      return { error: `Match ${matchId} is already 'rejected'.` };
    }

    // 4. Effect: Update the match status to 'rejected'
    await this.matches.updateOne(
      { _id: matchId },
      { $set: { status: "rejected" } },
    );

    // 5. Return success
    return {};
  }

  /**
   * @action explainMatch
   * @description Generates and stores an explanation for an accepted match,
   *              leveraging an optional LLM.
   * @param {{ requester: User, matchId: MatchID }} args - The user requesting the explanation and the match ID.
   * @requires The specified match must exist, the requester must be one of the users in the match,
   *           and the match's status must be 'accepted'.
   * @effects A 1-3 sentence explanation is generated (mocked here), stored in the match's `explanation` field, and returned.
   *          This explanation should ideally use public profile fields (from an external Profile concept)
   *          and the shared book's details.
   * @returns {Promise<{ explanation: string } | { error: string }>} A promise that resolves to an object
   *          containing the explanation text, or an error object.
   */
  async explainMatch(
    { requester, matchId }: { requester: User; matchId: MatchID },
  ): Promise<{ explanation: string } | { error: string }> {
    // 1. Precondition: Fetch the match and check its existence
    const match = await this.matches.findOne({ _id: matchId });
    if (!match) {
      return { error: `Match ${matchId} not found.` };
    }

    // 2. Precondition: Check if the requester is part of this match
    if (match.userA !== requester && match.userB !== requester) {
      return { error: `User ${requester} is not part of match ${matchId}.` };
    }

    // 3. Precondition: Check if the match is in 'accepted' status
    if (match.status !== "accepted") {
      return { error: `Match ${matchId} is not in 'accepted' status.` };
    }

    // 4. Effect: Generate explanation (mocked LLM interaction)
    // In a real application, this would involve calling an LLM service
    // with context from Profile and Book concepts.
    const otherUser = match.userA === requester ? match.userB : match.userA;
    const explanationText =
      match.explanation ||
      `You and ${otherUser} both recently finished "${match.book}". This creates a great opportunity to discuss the book's themes and characters, and perhaps discover new reads!`;

    // 5. Effect: Store the generated explanation in the match document
    await this.matches.updateOne(
      { _id: matchId },
      { $set: { explanation: explanationText } },
    );

    // 6. Return the explanation
    return { explanation: explanationText };
  }

  /**
   * @action nearbyMatches
   * @description Suggests other users who are "nearby" in interests to the owner,
   *              especially when direct co-finishers for a specific book are scarce.
   *              This functionality may be enhanced by LLMs.
   * @param {{ owner: User, book: Book }} args - The owner user ID and the book ID to base suggestions on.
   * @requires owner has a Profile (assumed by external concept) and has finished the specified book.
   * @effects Returns a set of user IDs that are considered "closest candidates" based on various criteria.
   * @returns {Promise<{ candidates: User[] } | { error: string }>} A promise that resolves to an object
   *          containing an array of suggested user IDs, or an error object.
   */
  async nearbyMatches(
    { owner, book }: { owner: User; book: Book },
  ): Promise<{ candidates: User[] } | { error: string }> {
    // 1. Precondition: Check if the owner has finished the book
    const ownerFinishedBook = await this.finishedBooks.findOne({
      user: owner,
      book: book,
    });
    if (!ownerFinishedBook) {
      return { error: `User ${owner} has not finished book ${book}.` };
    }

    // 2. Effect: Generate candidates (mocked LLM/recommendation logic)
    // This is where sophisticated recommendation logic or LLM interaction would occur.
    // It would involve querying profile data, book genres, themes, etc., potentially
    // from other concepts.
    console.log(
      `[Mock] Finding nearby matches for user ${owner} based on book ${book}...`,
    );

    // For demonstration, return a mock list of candidates.
    // In a real scenario, this would be a dynamic, intelligent list.
    const mockCandidates: User[] = [
      "user:Charlie" as User,
      "user:David" as User,
      "user:Eve" as User,
    ];

    // 3. Return the suggested candidates
    return { candidates: mockCandidates };
  }

  // --- Query Methods (start with underscore) ---

  /**
   * @query _getMatchesForUser
   * @description Retrieves all match records (pending, accepted, rejected) associated with a given user.
   * @param {{ userId: User }} args - The ID of the user.
   * @returns {Promise<Match[]>} A promise that resolves to an array of Match objects.
   */
  async _getMatchesForUser(
    { userId }: { userId: User },
  ): Promise<Match[]> {
    return await this.matches
      .find({ $or: [{ userA: userId }, { userB: userId }] })
      .toArray();
  }

  /**
   * @query _getFinishedBooksByUser
   * @description Retrieves all finished book records for a specific user.
   * @param {{ userId: User }} args - The ID of the user.
   * @returns {Promise<FinishedBook[]>} A promise that resolves to an array of FinishedBook objects.
   */
  async _getFinishedBooksByUser(
    { userId }: { userId: User },
  ): Promise<FinishedBook[]> {
    return await this.finishedBooks.find({ user: userId }).toArray();
  }

  /**
   * @query _getMatchesByBook
   * @description Retrieves all match records that are based on a specific book.
   * @param {{ bookId: Book }} args - The ID of the book.
   * @returns {Promise<Match[]>} A promise that resolves to an array of Match objects.
   */
  async _getMatchesByBook(
    { bookId }: { bookId: Book },
  ): Promise<Match[]> {
    return await this.matches.find({ book: bookId }).toArray();
  }

  // --- System/Helper Actions (start with underscore, often for testing or internal use) ---

  /**
   * @system _addFinishedBook
   * @description (System helper for testing/initial data) Records that a user has finished a book.
   *              In a live application, this would typically be called by a synchronization rule
   *              triggered by an action in a `BookReadingProgress` concept or similar.
   * @param {{ user: User, book: Book, finishedAt?: Date }} args - The user ID, book ID, and an optional finished date.
   * @effects Creates a new FinishedBook record if one doesn't already exist for the user and book.
   * @returns {Promise<Empty | { error: string }>} An empty object on success, or an error object.
   */
  async _addFinishedBook(
    { user, book, finishedAt = new Date() }: {
      user: User;
      book: Book;
      finishedAt?: Date;
    },
  ): Promise<Empty | { error: string }> {
    // Prevent duplicate entries for the same user-book finished record
    const existing = await this.finishedBooks.findOne({ user, book });
    if (existing) {
      return { error: `User ${user} already recorded finishing book ${book}.` };
    }

    const finishedBookRecord: FinishedBook = {
      _id: freshID(), // Use freshID for the record's primary key
      user,
      book,
      finishedAt,
    };
    await this.finishedBooks.insertOne(finishedBookRecord);
    return {};
  }
}
```