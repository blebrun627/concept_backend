---
timestamp: 'Sun Oct 19 2025 23:23:57 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_232357.757bbfb3.md]]'
content_id: 082e6eab78457033fb298f6a3635d7e9c80327975a483d9ae884a08b5d768764
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
   * concept: BookReading
   * purpose: Lets users read a book in-app and track their progress
   * principle: A user opens a book from their library. The book is divided into sections
   * (e.g., paragraphs, pages, chapters) with a defined order. The user moves through the sections,
   * and their position is stored. When finished reading, the book is marked completed.
   */

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
    // requires: book is not already in owner's library
    // Use $addToSet to ensure idempotence and prevent duplicates, which also handles the "not already in" check
    const result = await this.libraries.updateOne(
      { _id: owner, books: { $ne: book } }, // Only update if book is not already present
      { $addToSet: { books: book } },
      { upsert: true } // Create the library document if it doesn't exist
    );

    // If no document was matched and no document was upserted, it means the book was already there.
    if (result.matchedCount === 0 && result.upsertedCount === 0) {
      // We check for the explicit case where the book was already present
      const existingLibrary = await this.libraries.findOne({ _id: owner, books: book });
      if (existingLibrary) {
        return { error: `Book ${book} is already in user ${owner}'s library.` };
      }
      return { error: `Failed to add book ${book} to library for user ${owner} for an unknown reason.` };
    }
    // effects: add book to owner's library
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
    // We use deleteMany to handle potential edge cases, though unique index prevents multiple.
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
      // An empty library is a valid state, not an error.
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
