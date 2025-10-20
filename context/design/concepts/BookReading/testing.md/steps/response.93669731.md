---
timestamp: 'Sun Oct 19 2025 23:24:54 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_232454.65ac86ca.md]]'
content_id: 93669731079b82550097d8d3fab963e9e9227b865b5e0cc3401c574c64e797f2
---

# response:

```typescript
// file: src/BookReading/BookReadingConcept.ts
import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Declare collection prefix, use concept name
const PREFIX = "BookReading" + ".";

// Generic types of this concept
type User = ID;
type Book = ID;
type Section = ID;

/**
 * State: a set of Libraries with an owner of type User and a set of Books
 *
 * Represents a user's personal collection of books.
 * The _id of this document is the User's ID.
 */
interface LibraryDoc {
  _id: User; // The ID of the user who owns this library
  books: Book[]; // An array of book IDs in their library
}

/**
 * State: a set of BookStructures with a book of type Book and a set of Sections
 *
 * Defines the internal structure (ordered sections) of a book.
 * The _id of this document is the Book's ID.
 */
interface BookStructureDoc {
  _id: Book; // The ID of the book
  sections: Section[]; // An ordered list of section IDs for this book
}

/**
 * State: a set of Progresses with a reader of type User, a book of type Book,
 * a currentPlace of type Section, and a finished of type Flag (boolean)
 *
 * Tracks a user's reading progress for a specific book.
 * The _id is a unique identifier for this progress entry.
 */
interface ProgressDoc {
  _id: ID; // Unique ID for this specific progress entry (e.g., generated freshID)
  reader: User; // The ID of the user reading the book
  book: Book; // The ID of the book being read
  currentPlace: Section; // The ID of the current section the user is at
  finished: boolean; // True if the user has completed the book
}

/**
 * concept: BookReading
 * purpose: Lets users read a book in-app and track their progress
 * principle: A user opens a book from their library. The book is divided into sections
 * (e.g., paragraphs, pages, chapters) with a defined order. The user moves through the sections,
 * and their position is stored. When finished reading, the book is marked completed.
 */
export default class BookReadingConcept {
  // MongoDB collections for each state component
  libraries: Collection<LibraryDoc>;
  bookStructures: Collection<BookStructureDoc>;
  progresses: Collection<ProgressDoc>;

  constructor(private readonly db: Db) {
    this.libraries = this.db.collection(PREFIX + "libraries");
    this.bookStructures = this.db.collection(PREFIX + "bookStructures");
    this.progresses = this.db.collection(PREFIX + "progresses");

    // Ensure indexes for efficient lookups and to maintain data integrity
    // A unique index on reader and book ensures a user has only one progress entry per book.
    this.progresses.createIndex({ reader: 1, book: 1 }, { unique: true, background: true });
    // An index on books within libraries for faster checking if a book exists in a user's library.
    // This supports the `addToLibrary` and `openBook` preconditions efficiently.
    this.libraries.createIndex({ "books": 1 }, { background: true });
    // An index on owner for libraries for faster lookup of a user's library.
    this.libraries.createIndex({ "_id": 1 }, { unique: true, background: true });
    // An index on book for bookStructures for faster lookup of a book's structure.
    this.bookStructures.createIndex({ "_id": 1 }, { unique: true, background: true });
  }

  /**
   * addToLibrary
   * Adds a book to a user's personal library.
   *
   * @param {User} owner - The user who is adding the book.
   * @param {Book} book - The book to add to the library.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: The book is not already in the owner's library.
   * effects: The book is added to the owner's library. If the library doesn't exist, it's created.
   */
  async addToLibrary({ owner, book }: { owner: User; book: Book }): Promise<Empty | { error: string }> {
    // effects: add book to owner's library. Use $addToSet to prevent duplicates.
    // The query part `{ _id: owner, books: { $ne: book } }` attempts to find the document
    // AND ensures the book is NOT already present, fulfilling the 'requires'.
    const result = await this.libraries.updateOne(
      { _id: owner, books: { $ne: book } },
      { $addToSet: { books: book } },
      { upsert: true } // Create the library document if it doesn't exist
    );

    // If no document was matched and no document was upserted, it implies the book was already in the library
    // and thus the $ne: book condition was not met for an existing document.
    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      // Confirm it's truly due to the book already being there, as per the 'requires'
      const existingLibrary = await this.libraries.findOne({ _id: owner, books: book });
      if (existingLibrary) {
        return { error: `Book ${book} is already in user ${owner}'s library.` };
      }
      // Fallback for unexpected cases
      return { error: `Failed to add book ${book} to library for user ${owner} for an unknown reason.` };
    }
    return {};
  }

  /**
   * openBook
   * Initiates reading progress for a user on a specific book. If progress already exists, does nothing.
   *
   * @param {User} reader - The user opening the book.
   * @param {Book} book - The book to open.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: The book is in the reader's library, and a BookStructure for the book exists with sections.
   * effects: If a Progress entry for the reader and book already exists, do nothing.
   *   Otherwise, create a new Progress entry with the currentPlace set to the first section of the book, and finished = false.
   */
  async openBook({ reader, book }: { reader: User; book: Book }): Promise<Empty | { error: string }> {
    // requires: book is in reader's library
    const readerLibrary = await this.libraries.findOne({ _id: reader, books: book });
    if (!readerLibrary) {
      return { error: `Book ${book} is not in user ${reader}'s library.` };
    }

    // requires: BookStructure for the book must exist to determine the first section
    const bookStructure = await this.bookStructures.findOne({ _id: book });
    if (!bookStructure || bookStructure.sections.length === 0) {
      return { error: `Book structure for ${book} not found or has no sections defined.` };
    }
    const firstSection = bookStructure.sections[0];

    // Check if progress already exists for this reader and book
    const existingProgress = await this.progresses.findOne({ reader, book });
    if (existingProgress) {
      // effects: if a Progress exists, do nothing
      return {};
    }

    // effects: Else create Progress with currentPlace being the first section of the book and finished = false
    const newProgress: ProgressDoc = {
      _id: freshID(),
      reader,
      book,
      currentPlace: firstSection,
      finished: false,
    };
    const result = await this.progresses.insertOne(newProgress);
    if (!result.acknowledged) {
      return { error: `Failed to create progress for user ${reader} on book ${book}.` };
    }
    return {};
  }

  /**
   * jumpTo
   * Allows a user to jump to a specific section in a book they are reading.
   *
   * @param {User} reader - The user.
   * @param {Book} book - The book.
   * @param {Section} section - The section to jump to.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: The book is in the reader's library, a Progress entry exists for the reader and book,
   *   and the specified Section exists within the book's structure.
   * effects: Sets the Progress.currentPlace to the specified section and sets finished = false.
   */
  async jumpTo({ reader, book, section }: { reader: User; book: Book; section: Section }): Promise<Empty | { error: string }> {
    // requires: book is in reader's library
    const readerLibrary = await this.libraries.findOne({ _id: reader, books: book });
    if (!readerLibrary) {
      return { error: `Book ${book} is not in user ${reader}'s library.` };
    }

    // requires: Progress exists for the reader and book
    const existingProgress = await this.progresses.findOne({ reader, book });
    if (!existingProgress) {
      return { error: `No reading progress found for user ${reader} on book ${book}.` };
    }

    // requires: Section exists for book (i.e., is part of the book's structure)
    const bookStructure = await this.bookStructures.findOne({ _id: book, sections: section });
    if (!bookStructure) {
      return { error: `Section ${section} does not exist in book ${book}.` };
    }

    // effects: set Progress.currentPlace to section and finished = false
    // (Jumping to a section typically implies the user is still reading, so not finished)
    const result = await this.progresses.updateOne(
      { reader, book },
      { $set: { currentPlace: section, finished: false } }
    );

    if (result.matchedCount === 0) {
      // This should ideally not happen if existingProgress was found, due to the unique index on reader+book.
      return { error: `Failed to update progress for user ${reader} on book ${book}.` };
    }
    return {};
  }

  /**
   * nextSection
   * Advances the user's reading progress to the next sequential section in the book.
   *
   * @param {User} reader - The user.
   * @param {Book} book - The book.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: A Progress entry exists for the reader and book, and a subsequent section exists for the book.
   * effects: The currentPlace is set to the next section in the book's section list, and finished = false.
   */
  async nextSection({ reader, book }: { reader: User; book: Book }): Promise<Empty | { error: string }> {
    // requires: Progress exists for the reader and book
    const existingProgress = await this.progresses.findOne({ reader, book });
    if (!existingProgress) {
      return { error: `No reading progress found for user ${reader} on book ${book}.` };
    }

    // requires: Book structure must exist to determine the next section
    const bookStructure = await this.bookStructures.findOne({ _id: book });
    if (!bookStructure || bookStructure.sections.length === 0) {
      return { error: `Book structure for ${book} not found or has no sections.` };
    }

    const currentIndex = bookStructure.sections.indexOf(existingProgress.currentPlace);
    if (currentIndex === -1) {
      return { error: `Current place ${existingProgress.currentPlace} not found in book ${book}'s structure.` };
    }
    if (currentIndex >= bookStructure.sections.length - 1) {
      return { error: `No subsequent section exists for book ${book}. User is at the last section.` };
    }

    const nextSectionId = bookStructure.sections[currentIndex + 1];

    // effects: currentPlace is set to the next section in the book's section list and finished = false
    const result = await this.progresses.updateOne(
      { reader, book },
      { $set: { currentPlace: nextSectionId, finished: false } } // Reset finished if moving forward
    );

    if (result.matchedCount === 0) {
      // This should ideally not happen if existingProgress was found.
      return { error: `Failed to update progress for user ${reader} on book ${book}.` };
    }
    return {};
  }

  /**
   * markFinished
   * Marks a book as completed for a specific user.
   *
   * @param {User} reader - The user.
   * @param {Book} book - The book.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: A Progress entry exists for the reader and book, and finished = false.
   * effects: Sets the finished flag for the book to true in the user's progress.
   */
  async markFinished({ reader, book }: { reader: User; book: Book }): Promise<Empty | { error: string }> {
    // requires: Progress exists for the reader and book
    const existingProgress = await this.progresses.findOne({ reader, book });
    if (!existingProgress) {
      return { error: `No reading progress found for user ${reader} on book ${book}.` };
    }

    // requires: finished = false (cannot mark as finished if already finished)
    if (existingProgress.finished) {
      return { error: `Book ${book} is already marked as finished for user ${reader}.` };
    }

    // effects: set finished = true
    const result = await this.progresses.updateOne(
      { reader, book },
      { $set: { finished: true } }
    );

    if (result.matchedCount === 0) {
      // This should ideally not happen if existingProgress was found.
      return { error: `Failed to mark book ${book} as finished for user ${reader}.` };
    }
    return {};
  }

  /**
   * resetProgress
   * Resets a user's reading progress for a book back to the beginning.
   *
   * @param {User} reader - The user.
   * @param {Book} book - The book.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: A Progress entry exists for the reader and book, and a BookStructure for the book exists with sections.
   * effects: Sets the currentPlace to the first section of the book and finished = false.
   */
  async resetProgress({ reader, book }: { reader: User; book: Book }): Promise<Empty | { error: string }> {
    // requires: Progress exists for the reader and book
    const existingProgress = await this.progresses.findOne({ reader, book });
    if (!existingProgress) {
      return { error: `No reading progress found for user ${reader} on book ${book}.` };
    }

    // requires: BookStructure for the book must exist to get the first section
    const bookStructure = await this.bookStructures.findOne({ _id: book });
    if (!bookStructure || bookStructure.sections.length === 0) {
      return { error: `Book structure for ${book} not found or has no sections.` };
    }
    const firstSection = bookStructure.sections[0];

    // effects: set currentPlace to the first section of the book and finished = false
    const result = await this.progresses.updateOne(
      { reader, book },
      { $set: { currentPlace: firstSection, finished: false } }
    );

    if (result.matchedCount === 0) {
      // This should ideally not happen if existingProgress was found.
      return { error: `Failed to reset progress for user ${reader} on book ${book}.` };
    }
    return {};
  }

  /**
   * removeFromLibrary
   * Removes a book from a user's library and also deletes their reading progress for that book.
   *
   * @param {User} owner - The user whose library the book is being removed from.
   * @param {Book} book - The book to remove.
   * @returns {Empty | {error: string}} An empty object on success, or an error object.
   *
   * requires: The book is in the owner's library.
   * effects: The book is removed from the owner's library. Any Progress entry for this owner and book is also removed.
   */
  async removeFromLibrary({ owner, book }: { owner: User; book: Book }): Promise<Empty | { error: string }> {
    // requires: book is in owner's library
    const ownerLibrary = await this.libraries.findOne({ _id: owner, books: book });
    if (!ownerLibrary) {
      return { error: `Book ${book} is not in user ${owner}'s library.` };
    }

    // effects: remove book from owner's library
    const updateResult = await this.libraries.updateOne(
      { _id: owner },
      { $pull: { books: book } }
    );

    if (updateResult.matchedCount === 0) {
      // This case should ideally not happen if ownerLibrary was found, but a check is good.
      return { error: `Failed to remove book ${book} from user ${owner}'s library.` };
    }

    // effects: remove Progress for the owner and book if it exists
    // We use deleteMany to handle potential edge cases, though unique index prevents multiple for a reader/book.
    await this.progresses.deleteMany({ reader: owner, book });

    return {};
  }

  // --- Concept Queries ---

  /**
   * _getLibrary
   * Returns the list of books in a user's library.
   *
   * @param {User} owner - The user whose library to retrieve.
   * @returns {{books: Book[]} | {error: string}} An object containing the list of books, or an error object.
   */
  async _getLibrary({ owner }: { owner: User }): Promise<{ books: Book[] } | { error: string }> {
    const library = await this.libraries.findOne({ _id: owner });
    if (!library) {
      // An empty library is a valid state for a user with no books, not an error.
      return { books: [] };
    }
    return { books: library.books };
  }

  /**
   * _getProgress
   * Returns the reading progress (current place and finished status) for a user on a specific book.
   *
   * @param {User} reader - The user.
   * @param {Book} book - The book.
   * @returns {{currentPlace: Section, finished: boolean} | {error: string}} An object with progress details, or an error object.
   */
  async _getProgress({ reader, book }: { reader: User; book: Book }): Promise<{ currentPlace: Section; finished: boolean } | { error: string }> {
    const progress = await this.progresses.findOne({ reader, book });
    if (!progress) {
      return { error: `No reading progress found for user ${reader} on book ${book}.` };
    }
    return { currentPlace: progress.currentPlace, finished: progress.finished };
  }

  /**
   * _getBookStructure
   * Returns the ordered list of sections for a given book.
   *
   * @param {Book} book - The book.
   * @returns {{sections: Section[]} | {error: string}} An object with the book's sections, or an error object.
   */
  async _getBookStructure({ book }: { book: Book }): Promise<{ sections: Section[] } | { error: string }> {
    const structure = await this.bookStructures.findOne({ _id: book });
    if (!structure) {
      return { error: `Book structure for ${book} not found.` };
    }
    return { sections: structure.sections };
  }
}
```

```typescript
// file: src/BookReading/BookReadingConcept.test.ts
import { Collection } from "npm:mongodb";
import { assertEquals, assertNotEquals, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID } from "@utils/types.ts";

import BookReadingConcept from "./BookReadingConcept.ts";

// Define test IDs
const TEST_USER_ALICE = "user:Alice" as ID;
const TEST_USER_BOB = "user:Bob" as ID;
const TEST_BOOK_HP = "book:HarryPotter" as ID;
const TEST_BOOK_LOTR = "book:LordOfTheRings" as ID;
const TEST_SECTION_HP1 = "section:HP_Chapter1" as ID;
const TEST_SECTION_HP2 = "section:HP_Chapter2" as ID;
const TEST_SECTION_HP3 = "section:HP_Chapter3" as ID;
const TEST_SECTION_LOTR1 = "section:LOTR_Part1" as ID;
const TEST_SECTION_LOTR2 = "section:LOTR_Part2" as ID;

// Helper to manually insert a book structure for testing, as this concept doesn't manage book structure creation
async function insertBookStructure(
  bookStructuresCollection: Collection<any>,
  bookId: Book,
  sections: Section[],
) {
  // Overwrite if exists, ensuring a clean state for the book's structure for each test run if needed
  await bookStructuresCollection.replaceOne(
    { _id: bookId },
    { _id: bookId, sections: sections },
    { upsert: true },
  );
}

Deno.test("BookReadingConcept", async (t) => {
  const [db, client] = await testDb();
  const concept = new BookReadingConcept(db);

  // Setup book structures for testing
  await insertBookStructure(concept.bookStructures, TEST_BOOK_HP, [
    TEST_SECTION_HP1,
    TEST_SECTION_HP2,
    TEST_SECTION_HP3,
  ]);
  await insertBookStructure(concept.bookStructures, TEST_BOOK_LOTR, [
    TEST_SECTION_LOTR1,
    TEST_SECTION_LOTR2,
  ]);

  // --- Test addToLibrary ---
  await t.step("should add a book to an owner's library", async () => {
    const result = await concept.addToLibrary({ owner: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const library = await concept.libraries.findOne({ _id: TEST_USER_ALICE });
    assertEquals(library?.books.includes(TEST_BOOK_HP), true);
  });

  await t.step("should return error if book is already in owner's library", async () => {
    // Attempt to add the same book again
    const result = await concept.addToLibrary({ owner: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book ${TEST_BOOK_HP} is already in user ${TEST_USER_ALICE}'s library.` });
  });

  await t.step("should add another book to the same owner's library", async () => {
    const result = await concept.addToLibrary({ owner: TEST_USER_ALICE, book: TEST_BOOK_LOTR });
    assertEquals(result, {});

    const library = await concept.libraries.findOne({ _id: TEST_USER_ALICE });
    assertEquals(library?.books.includes(TEST_BOOK_LOTR), true);
    assertEquals(library?.books.length, 2);
  });

  // --- Test openBook ---
  await t.step("should create new progress when opening a book for the first time", async () => {
    const result = await concept.openBook({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const progress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertNotEquals(progress, null);
    assertEquals(progress?.currentPlace, TEST_SECTION_HP1);
    assertEquals(progress?.finished, false);
  });

  await t.step("should do nothing if progress already exists when opening a book", async () => {
    const initialProgress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertNotEquals(initialProgress, null);

    const result = await concept.openBook({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, {}); // Should indicate success (doing nothing is a successful outcome here)

    const finalProgress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(finalProgress, initialProgress, "Progress should not have changed");
  });

  await t.step("should return error if book is not in reader's library when opening", async () => {
    const result = await concept.openBook({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book ${TEST_BOOK_HP} is not in user ${TEST_USER_BOB}'s library.` });
  });

  await t.step("should return error if book structure is missing or empty when opening", async () => {
    const NON_EXISTENT_BOOK = "book:NoStructure" as ID;
    await concept.addToLibrary({ owner: TEST_USER_ALICE, book: NON_EXISTENT_BOOK }); // Add to library first

    const result = await concept.openBook({ reader: TEST_USER_ALICE, book: NON_EXISTENT_BOOK });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book structure for ${NON_EXISTENT_BOOK} not found or has no sections defined.` });

    // Clean up
    await concept.removeFromLibrary({ owner: TEST_USER_ALICE, book: NON_EXISTENT_BOOK });
  });

  // --- Test jumpTo ---
  await t.step("should update currentPlace when jumping to a valid section", async () => {
    const result = await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: TEST_SECTION_HP2 });
    assertEquals(result, {});

    const progress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(progress?.currentPlace, TEST_SECTION_HP2);
    assertEquals(progress?.finished, false, "Should set finished to false when jumping");
  });

  await t.step("should return error if book is not in reader's library when jumping", async () => {
    const result = await concept.jumpTo({ reader: TEST_USER_BOB, book: TEST_BOOK_HP, section: TEST_SECTION_HP1 });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book ${TEST_BOOK_HP} is not in user ${TEST_USER_BOB}'s library.` });
  });

  await t.step("should return error if no progress exists when jumping", async () => {
    await concept.addToLibrary({ owner: TEST_USER_BOB, book: TEST_BOOK_LOTR }); // Book in library, but not opened yet
    const result = await concept.jumpTo({ reader: TEST_USER_BOB, book: TEST_BOOK_LOTR, section: TEST_SECTION_LOTR1 });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No reading progress found for user ${TEST_USER_BOB} on book ${TEST_BOOK_LOTR}.` });
  });

  await t.step("should return error if target section does not exist in book", async () => {
    const result = await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: "nonExistentSection" as ID });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Section nonExistentSection does not exist in book ${TEST_BOOK_HP}.` });
  });

  // --- Test nextSection ---
  await t.step("should advance currentPlace to the next section", async () => {
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: TEST_SECTION_HP1 }); // Set to first section
    const result = await concept.nextSection({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const progress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(progress?.currentPlace, TEST_SECTION_HP2);
    assertEquals(progress?.finished, false, "Should set finished to false when moving to next");
  });

  await t.step("should return error if no next section exists", async () => {
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: TEST_SECTION_HP3 }); // Set to last section
    const result = await concept.nextSection({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No subsequent section exists for book ${TEST_BOOK_HP}. User is at the last section.` });
  });

  await t.step("should return error if no progress exists when moving to next section", async () => {
    const result = await concept.nextSection({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No reading progress found for user ${TEST_USER_BOB} on book ${TEST_BOOK_HP}.` });
  });

  // --- Test markFinished ---
  await t.step("should mark a book as finished", async () => {
    // Ensure progress and not finished for LOTR for Alice
    await concept.openBook({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR });
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR, section: TEST_SECTION_LOTR2 });
    const result = await concept.markFinished({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR });
    assertEquals(result, {});

    const progress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR });
    assertEquals(progress?.finished, true);
  });

  await t.step("should return error if book is already marked finished", async () => {
    // Already marked finished by previous step
    const result = await concept.markFinished({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book ${TEST_BOOK_LOTR} is already marked as finished for user ${TEST_USER_ALICE}.` });
  });

  await t.step("should return error if no progress exists when marking finished", async () => {
    const result = await concept.markFinished({ reader: TEST_USER_BOB, book: TEST_BOOK_LOTR });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No reading progress found for user ${TEST_USER_BOB} on book ${TEST_BOOK_LOTR}.` });
  });

  // --- Test resetProgress ---
  await t.step("should reset progress for a book", async () => {
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: TEST_SECTION_HP3 }); // Set to last section
    await concept.markFinished({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP }); // Mark finished

    const result = await concept.resetProgress({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const progress = await concept.progresses.findOne({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(progress?.currentPlace, TEST_SECTION_HP1);
    assertEquals(progress?.finished, false);
  });

  await t.step("should return error if no progress exists when resetting", async () => {
    const result = await concept.resetProgress({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No reading progress found for user ${TEST_USER_BOB} on book ${TEST_BOOK_HP}.` });
  });

  // --- Test removeFromLibrary ---
  await t.step("should remove a book from library and delete associated progress", async () => {
    // Setup for BOB
    await concept.addToLibrary({ owner: TEST_USER_BOB, book: TEST_BOOK_HP });
    await concept.openBook({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    const initialProgress = await concept.progresses.findOne({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertNotEquals(initialProgress, null, "Progress should exist before removal");

    const result = await concept.removeFromLibrary({ owner: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const library = await concept.libraries.findOne({ _id: TEST_USER_BOB });
    // If it was the only book, the library doc might be deleted, or book removed from array.
    // For now, checking if book is no longer in library
    assertEquals(library?.books.includes(TEST_BOOK_HP), false);

    const progressAfter = await concept.progresses.findOne({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertEquals(progressAfter, null, "Progress should be deleted after removing from library");
  });

  await t.step("should return error if book is not in library when removing", async () => {
    const result = await concept.removeFromLibrary({ owner: TEST_USER_ALICE, book: "nonExistentBook" as ID });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book nonExistentBook is not in user ${TEST_USER_ALICE}'s library.` });
  });

  // --- Test Queries ---
  await t.step("_getLibrary should return books in library", async () => {
    // Alice's library should still have HP and LOTR (if not removed in prior steps affecting Alice)
    const result = await concept._getLibrary({ owner: TEST_USER_ALICE });
    // Note: order might not be preserved by $addToSet and $pull, so sort for comparison
    assertEquals(result.books.sort(), [TEST_BOOK_HP, TEST_BOOK_LOTR].sort());
  });

  await t.step("_getLibrary should return empty array for user with no library", async () => {
    const result = await concept._getLibrary({ owner: "user:NoLibrary" as ID });
    assertEquals(result, { books: [] });
  });

  await t.step("_getProgress should return current progress", async () => {
    // Ensure some progress exists
    await concept.openBook({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP }); // Re-open if it was implicitly removed by cleanup
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP, section: TEST_SECTION_HP2 });

    const result = await concept._getProgress({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
    assertEquals(result, { currentPlace: TEST_SECTION_HP2, finished: false });
  });

  await t.step("_getProgress should return error if no progress exists", async () => {
    const result = await concept._getProgress({ reader: TEST_USER_BOB, book: TEST_BOOK_LOTR });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `No reading progress found for user ${TEST_USER_BOB} on book ${TEST_BOOK_LOTR}.` });
  });

  await t.step("_getBookStructure should return book sections", async () => {
    const result = await concept._getBookStructure({ book: TEST_BOOK_HP });
    assertEquals(result, { sections: [TEST_SECTION_HP1, TEST_SECTION_HP2, TEST_SECTION_HP3] });
  });

  await t.step("_getBookStructure should return error if structure not found", async () => {
    const result = await concept._getBookStructure({ book: "book:Unknown" as ID });
    assertNotEquals(result, {});
    assertObjectMatch(result as { error: string }, { error: `Book structure for book:Unknown not found.` });
  });

  // --- Trace: Fulfilling the Principle ---
  await t.step("Principle: user reads a book and marks it complete", async () => {
    const TRACE_USER = "user:Trace" as ID;
    const TRACE_BOOK = "book:TraceBook" as ID;
    const TRACE_SECTION_1 = "section:Trace_Ch1" as ID;
    const TRACE_SECTION_2 = "section:Trace_Ch2" as ID;
    const TRACE_SECTION_3 = "section:Trace_Ch3" as ID;

    // 1. Setup: A book is divided into sections with a defined order.
    // (Handled by the insertBookStructure helper for this specific book)
    await insertBookStructure(concept.bookStructures, TRACE_BOOK, [
      TRACE_SECTION_1,
      TRACE_SECTION_2,
      TRACE_SECTION_3,
    ]);

    // 2. A user opens a book from their library.
    await concept.addToLibrary({ owner: TRACE_USER, book: TRACE_BOOK });
    const openResult = await concept.openBook({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(openResult, {}, "openBook should succeed");

    let progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_1, "Initial current place should be first section");
    assertEquals(progress?.finished, false, "Book should not be finished initially");

    // 3. The user moves through the sections, and their position is stored.
    const nextResult1 = await concept.nextSection({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(nextResult1, {}, "nextSection should succeed");
    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_2, "Should move to next section (Chapter 2)");
    assertEquals(progress?.finished, false);

    const jumpResult = await concept.jumpTo({ reader: TRACE_USER, book: TRACE_BOOK, section: TRACE_SECTION_3 });
    assertEquals(jumpResult, {}, "jumpTo should succeed");
    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_3, "Should jump to specified section (Chapter 3)");
    assertEquals(progress?.finished, false);

    // 4. When finished reading, the book is marked completed.
    const markFinishedResult = await concept.markFinished({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(markFinishedResult, {}, "markFinished should succeed");

    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.finished, true, "Book should be marked as finished");
    assertEquals(progress?.currentPlace, TRACE_SECTION_3, "Current place should remain at the last section read");

    // Verification of final state
    const library = await concept.libraries.findOne({ _id: TRACE_USER });
    assertEquals(library?.books.includes(TRACE_BOOK), true, "Trace book should still be in library");
    assertEquals(progress?.reader, TRACE_USER);
    assertEquals(progress?.book, TRACE_BOOK);
    assertEquals(progress?.currentPlace, TRACE_SECTION_3);
    assertEquals(progress?.finished, true);
  });

  await client.close();
});
```

```trace
# trace: Principle for BookReading

**Scenario**: Alice wants to read "Harry Potter and the Sorcerer's Stone" and track her progress.

1.  **Preparation (External to BookReading, but sets up necessary state):**
    *   A `BookStructure` for "Harry Potter" (ID: `book:HarryPotter`) is defined, consisting of sections: `section:HP_Chapter1`, `section:HP_Chapter2`, `section:HP_Chapter3`. (This is handled by manual insertion in the test setup via `insertBookStructure`).

2.  **`addToLibrary`**: Alice adds "Harry Potter" to her library.
    *   **Action**: `BookReading.addToLibrary(owner: "user:Alice", book: "book:HarryPotter")`
    *   **Expected State**: Alice's `Library` document now contains `book:HarryPotter`.

3.  **`openBook`**: Alice decides to start reading "Harry Potter".
    *   **Action**: `BookReading.openBook(reader: "user:Alice", book: "book:HarryPotter")`
    *   **Expected State**: A `Progress` document is created for Alice and "Harry Potter", with `currentPlace` set to `section:HP_Chapter1` (the first section from the `BookStructure`) and `finished` set to `false`.

4.  **`nextSection`**: Alice reads Chapter 1 and wants to move to Chapter 2.
    *   **Action**: `BookReading.nextSection(reader: "user:Alice", book: "book:HarryPotter")`
    *   **Expected State**: Alice's `Progress` for "Harry Potter" has `currentPlace` updated to `section:HP_Chapter2`. `finished` remains `false`.

5.  **`jumpTo`**: Alice skips ahead to Chapter 3 (perhaps she's re-reading).
    *   **Action**: `BookReading.jumpTo(reader: "user:Alice", book: "book:HarryPotter", section: "section:HP_Chapter3")`
    *   **Expected State**: Alice's `Progress` for "Harry Potter" has `currentPlace` updated to `section:HP_Chapter3`. `finished` remains `false` (as jumping implies active reading).

6.  **`markFinished`**: Alice finishes reading Chapter 3 and completes the book.
    *   **Action**: `BookReading.markFinished(reader: "user:Alice", book: "book:HarryPotter")`
    *   **Expected State**: Alice's `Progress` for "Harry Potter" has `finished` updated to `true`. `currentPlace` remains `section:HP_Chapter3`.

**Verification**:
*   Alice's library contains "Harry Potter". (Query: `_getLibrary`)
*   Alice's reading progress for "Harry Potter" correctly reflects that she finished at `section:HP_Chapter3` and the book is marked as `finished: true`. (Query: `_getProgress`)
```
