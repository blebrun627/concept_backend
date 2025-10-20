---
timestamp: 'Sun Oct 19 2025 23:49:58 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_234958.953de700.md]]'
content_id: e8ac5925ce57bcb1e3305e5d1ac3c4f56e90dcf9d117da2dbdbfaa2931705c06
---

# response:

```typescript
// file: src/profiles/ProfilesConcept.ts

import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "../../utils/types.ts"; // Assuming utils are one level up
import { freshID } from "../../utils/database.ts"; // Assuming utils are one level up

/**
 * @concept Profiles
 * @purpose Creates a representation of each reader's identity, interests, and history
 */
// Define generic types used by this concept, typically IDs for external entities.
type User = ID;
type Genre = ID;
type Book = ID;

/**
 * Interface for the 'Profiles' collection documents.
 * Represents a user's profile with their preferences and reading history.
 *
 * @state a set of Profiles with
 *   an owner of type User (mapped to _id)
 *   a set of Genres of type Genre
 *   a set of finishedBooks of type Book
 *   a set of currentBooks of type Book
 */
interface ProfileDocument {
  _id: User; // The owner's ID serves as the unique identifier for the profile
  genres: Genre[];
  finishedBooks: Book[];
  currentBooks: Book[];
}

export default class ProfilesConcept {
  // MongoDB collection for storing profiles.
  profiles: Collection<ProfileDocument>;

  constructor(private readonly db: Db) {
    // Collection prefix, using the concept name to ensure uniqueness.
    const PREFIX = "Profiles" + ".";
    this.profiles = this.db.collection(PREFIX + "profiles");
  }

  /**
   * @action createProfile
   * @requires owner does not already have a profile
   * @effects creates a new Profile with empty genres, finishedBooks, and currentBooks
   */
  async createProfile({ owner }: { owner: User }): Promise<Empty | { error: string }> {
    const existingProfile = await this.profiles.findOne({ _id: owner });
    if (existingProfile) {
      return { error: `Profile for user ${owner} already exists.` };
    }

    await this.profiles.insertOne({
      _id: owner,
      genres: [],
      finishedBooks: [],
      currentBooks: [],
    });
    return {};
  }

  /**
   * @action addGenre
   * @requires owner has a Profile and genre is not already in genres
   * @effects adds genre to owner's genres
   */
  async addGenre({ owner, genre }: { owner: User; genre: Genre }): Promise<Empty | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    if (profile.genres.includes(genre)) {
      return { error: `Genre ${genre} is already in user ${owner}'s profile.` };
    }

    await this.profiles.updateOne(
      { _id: owner },
      { $addToSet: { genres: genre } }, // $addToSet prevents duplicates
    );
    return {};
  }

  /**
   * @action removeGenre
   * @requires owner has a Profile and genre is one of their genres
   * @effects removes genre from owner's genres
   */
  async removeGenre({ owner, genre }: { owner: User; genre: Genre }): Promise<Empty | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    if (!profile.genres.includes(genre)) {
      return { error: `Genre ${genre} is not in user ${owner}'s profile.` };
    }

    await this.profiles.updateOne(
      { _id: owner },
      { $pull: { genres: genre } },
    );
    return {};
  }

  /**
   * @action addCurrentBook
   * @requires owner has a profile and book is not in currentBooks or finishedBooks
   * @effects add book to owner's currentBooks
   */
  async addCurrentBook({ owner, book }: { owner: User; book: Book }): Promise<Empty | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    if (profile.currentBooks.includes(book)) {
      return { error: `Book ${book} is already in user ${owner}'s current books.` };
    }
    if (profile.finishedBooks.includes(book)) {
      return { error: `Book ${book} is already in user ${owner}'s finished books.` };
    }

    await this.profiles.updateOne(
      { _id: owner },
      { $addToSet: { currentBooks: book } },
    );
    return {};
  }

  /**
   * @action removeCurrentBook
   * @requires owner has a Profile and book in currentBooks
   * @effects remove book from owner's currentBooks
   */
  async removeCurrentBook({ owner, book }: { owner: User; book: Book }): Promise<Empty | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    if (!profile.currentBooks.includes(book)) {
      return { error: `Book ${book} is not in user ${owner}'s current books.` };
    }

    await this.profiles.updateOne(
      { _id: owner },
      { $pull: { currentBooks: book } },
    );
    return {};
  }

  /**
   * @action addFinishedBook
   * @requires owner has a Profile and book in currentBooks
   * @effects add book to owner's finishedBooks, and remove it from currentBooks
   * (Interpretation: This action moves a book from current to finished)
   */
  async addFinishedBook({ owner, book }: { owner: User; book: Book }): Promise<Empty | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    // Precondition: book must be in currentBooks to be "finished"
    if (!profile.currentBooks.includes(book)) {
      return { error: `Book ${book} is not in user ${owner}'s current books, cannot mark as finished.` };
    }
    // Prevent double-adding to finishedBooks if it somehow got there already
    if (profile.finishedBooks.includes(book)) {
        return { error: `Book ${book} is already in user ${owner}'s finished books.` };
    }

    await this.profiles.updateOne(
      { _id: owner },
      {
        $addToSet: { finishedBooks: book }, // Add to finished books
        $pull: { currentBooks: book },      // Remove from current books
      },
    );
    return {};
  }

  /**
   * @query _getProfile
   * @effects Returns the profile for a given user.
   */
  async _getProfile({ owner }: { owner: User }): Promise<ProfileDocument | null> {
    return await this.profiles.findOne({ _id: owner });
  }

  /**
   * @query _getGenres
   * @effects Returns the list of genres for a given user.
   */
  async _getGenres({ owner }: { owner: User }): Promise<{ genres: Genre[] } | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner }, { projection: { genres: 1 } });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    return { genres: profile.genres || [] };
  }

  /**
   * @query _getCurrentBooks
   * @effects Returns the list of current books for a given user.
   */
  async _getCurrentBooks({ owner }: { owner: User }): Promise<{ currentBooks: Book[] } | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner }, { projection: { currentBooks: 1 } });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    return { currentBooks: profile.currentBooks || [] };
  }

  /**
   * @query _getFinishedBooks
   * @effects Returns the list of finished books for a given user.
   */
  async _getFinishedBooks({ owner }: { owner: User }): Promise<{ finishedBooks: Book[] } | { error: string }> {
    const profile = await this.profiles.findOne({ _id: owner }, { projection: { finishedBooks: 1 } });
    if (!profile) {
      return { error: `Profile for user ${owner} not found.` };
    }
    return { finishedBooks: profile.finishedBooks || [] };
  }
}
```
