[@implementation](implementation.md)

[@testing-concepts](../../background/testing-concepts.md)

# test: BookReading

# response:

```typescript
// file: src/BookReading/BookReadingConcept.test.ts
import { assertEquals, assertObjectMatch, assertNotEquals } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";
import BookReadingConcept from "./BookReadingConcept.ts";

// --- Test Data ---
const USER_ALICE = "user:Alice" as ID;
const USER_BOB = "user:Bob" as ID;

const BOOK_LORD_OF_RINGS = "book:LordOfTheRings" as ID;
const BOOK_HOBBIT = "book:TheHobbit" as ID;

const SECTION_LOTR_PROLOGUE = "section:LOTR_Prologue" as ID;
const SECTION_LOTR_CHAP1 = "section:LOTR_Chap1" as ID;
const SECTION_LOTR_CHAP2 = "section:LOTR_Chap2" as ID;
const SECTION_LOTR_CHAP3 = "section:LOTR_Chap3" as ID;
const SECTION_LOTR_EPILOGUE = "section:LOTR_Epilogue" as ID;

const BOOK_STRUCTURE_LOTR = {
  _id: BOOK_LORD_OF_RINGS,
  sections: [
    SECTION_LOTR_PROLOGUE,
    SECTION_LOTR_CHAP1,
    SECTION_LOTR_CHAP2,
    SECTION_LOTR_CHAP3,
    SECTION_LOTR_EPILOGUE,
  ],
};

const BOOK_STRUCTURE_HOBBIT = {
  _id: BOOK_HOBBIT,
  sections: [
    "section:Hobbit_Chap1" as ID,
    "section:Hobbit_Chap2" as ID,
  ],
};

const UNKNOWN_BOOK = "book:Unknown" as ID;
const UNKNOWN_SECTION = "section:Unknown" as ID;

Deno.test("BookReadingConcept - Core Functionality", async (t) => {
  const [db, client] = await testDb();
  const concept = new BookReadingConcept(db);

  // Pre-populate some book structures for testing
  await concept.bookStructures.insertOne(BOOK_STRUCTURE_LOTR);
  await concept.bookStructures.insertOne(BOOK_STRUCTURE_HOBBIT);

  await t.step("addToLibrary: should add a book to a user's library", async () => {
    const result = await concept.addToLibrary({ owner: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {});

    const library = await concept._getLibrary({ owner: USER_ALICE });
    assertObjectMatch(library as object, { books: [BOOK_LORD_OF_RINGS] });
  });

  await t.step("addToLibrary: should add another book to an existing library", async () => {
    const result = await concept.addToLibrary({ owner: USER_ALICE, book: BOOK_HOBBIT });
    assertEquals(result, {});

    const library = await concept._getLibrary({ owner: USER_ALICE });
    assertObjectMatch(library as object, { books: [BOOK_LORD_OF_RINGS, BOOK_HOBBIT] });
  });

  await t.step("addToLibrary: should not add the same book twice", async () => {
    const result = await concept.addToLibrary({ owner: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(result as object, { error: `Book ${BOOK_LORD_OF_RINGS} is already in user ${USER_ALICE}'s library.` });

    const library = await concept._getLibrary({ owner: USER_ALICE });
    assertEquals((library as { books: ID[] }).books.length, 2); // Still 2 books
  });

  await t.step("openBook: should create new progress for a user and book", async () => {
    const result = await concept.openBook({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {});

    const progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progress as object, { currentPlace: SECTION_LOTR_PROLOGUE, finished: false });
  });

  await t.step("openBook: should not create progress if already exists", async () => {
    const initialProgress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals((initialProgress as { currentPlace: ID }).currentPlace, SECTION_LOTR_PROLOGUE);

    const result = await concept.openBook({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {}); // Should still return success as per spec

    const progressAfter = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progressAfter as object, initialProgress as object); // State should be unchanged
  });

  await t.step("openBook: should fail if book is not in reader's library", async () => {
    const result = await concept.openBook({ reader: USER_BOB, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(result as object, { error: `Book ${BOOK_LORD_OF_RINGS} is not in user ${USER_BOB}'s library.` });
  });

  await t.step("openBook: should fail if book structure not found", async () => {
    await concept.addToLibrary({ owner: USER_BOB, book: UNKNOWN_BOOK }); // Add to library for prerequisite
    const result = await concept.openBook({ reader: USER_BOB, book: UNKNOWN_BOOK });
    assertObjectMatch(result as object, { error: `Book structure for ${UNKNOWN_BOOK} not found or has no sections defined.` });
  });

  await t.step("jumpTo: should update current place", async () => {
    const result = await concept.jumpTo({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS, section: SECTION_LOTR_CHAP3 });
    assertEquals(result, {});

    const progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progress as object, { currentPlace: SECTION_LOTR_CHAP3, finished: false });
  });

  await t.step("jumpTo: should fail if section does not exist in book", async () => {
    const result = await concept.jumpTo({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS, section: UNKNOWN_SECTION });
    assertObjectMatch(result as object, { error: `Section ${UNKNOWN_SECTION} does not exist in book ${BOOK_LORD_OF_RINGS}.` });
  });

  await t.step("jumpTo: should fail if no progress exists for book", async () => {
    // USER_BOB has BOOK_LORD_OF_RINGS in library, but hasn't opened it yet
    await concept.addToLibrary({ owner: USER_BOB, book: BOOK_LORD_OF_RINGS });
    const result = await concept.jumpTo({ reader: USER_BOB, book: BOOK_LORD_OF_RINGS, section: SECTION_LOTR_CHAP1 });
    assertObjectMatch(result as object, { error: `No reading progress found for user ${USER_BOB} on book ${BOOK_LORD_OF_RINGS}.` });
  });

  await t.step("nextSection: should move to the subsequent section", async () => {
    // Current place for USER_ALICE, LOTR is SECTION_LOTR_CHAP3
    const result = await concept.nextSection({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {});

    const progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progress as object, { currentPlace: SECTION_LOTR_EPILOGUE, finished: false });
  });

  await t.step("nextSection: should fail if no subsequent section exists (already at last section)", async () => {
    // USER_ALICE, LOTR is at SECTION_LOTR_EPILOGUE
    const result = await concept.nextSection({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(result as object, { error: `No subsequent section exists for book ${BOOK_LORD_OF_RINGS}. User is at the last section.` });
  });

  await t.step("nextSection: should fail if no progress exists", async () => {
    const result = await concept.nextSection({ reader: USER_BOB, book: BOOK_HOBBIT }); // Bob has Hobit in library, but no progress
    assertObjectMatch(result as object, { error: `No reading progress found for user ${USER_BOB} on book ${BOOK_HOBBIT}.` });
  });

  await t.step("markFinished: should mark the book as finished", async () => {
    const result = await concept.markFinished({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {});

    const progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progress as object, { currentPlace: SECTION_LOTR_EPILOGUE, finished: true });
  });

  await t.step("markFinished: should fail if book is already marked finished", async () => {
    const result = await concept.markFinished({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(result as object, { error: `Book ${BOOK_LORD_OF_RINGS} is already marked as finished for user ${USER_ALICE}.` });
  });

  await t.step("markFinished: should fail if no progress exists", async () => {
    const result = await concept.markFinished({ reader: USER_BOB, book: BOOK_LORD_OF_RINGS }); // Bob has book but no progress
    assertObjectMatch(result as object, { error: `No reading progress found for user ${USER_BOB} on book ${BOOK_LORD_OF_RINGS}.` });
  });

  await t.step("resetProgress: should set currentPlace to first section and finished to false", async () => {
    const result = await concept.resetProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertEquals(result, {});

    const progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(progress as object, { currentPlace: SECTION_LOTR_PROLOGUE, finished: false });
  });

  await t.step("resetProgress: should fail if no progress exists", async () => {
    const result = await concept.resetProgress({ reader: USER_BOB, book: BOOK_HOBBIT });
    assertObjectMatch(result as object, { error: `No reading progress found for user ${USER_BOB} on book ${BOOK_HOBBIT}.` });
  });

  await t.step("removeFromLibrary: should remove book from library and delete progress", async () => {
    // Alice has BOOK_HOBBIT and no progress for it yet. Let's create progress first.
    await concept.openBook({ reader: USER_ALICE, book: BOOK_HOBBIT });
    const progressBefore = await concept._getProgress({ reader: USER_ALICE, book: BOOK_HOBBIT });
    assertNotEquals(progressBefore as { error?: string }).error, "No reading progress found..."); // Ensure progress exists

    const result = await concept.removeFromLibrary({ owner: USER_ALICE, book: BOOK_HOBBIT });
    assertEquals(result, {});

    const library = await concept._getLibrary({ owner: USER_ALICE });
    assertEquals((library as { books: ID[] }).books, [BOOK_LORD_OF_RINGS]); // HOBBIT should be gone

    const progressAfter = await concept._getProgress({ reader: USER_ALICE, book: BOOK_HOBBIT });
    assertObjectMatch(progressAfter as object, { error: `No reading progress found for user ${USER_ALICE} on book ${BOOK_HOBBIT}.` }); // Progress should be gone
  });

  await t.step("removeFromLibrary: should fail if book not in library", async () => {
    const result = await concept.removeFromLibrary({ owner: USER_ALICE, book: UNKNOWN_BOOK });
    assertObjectMatch(result as object, { error: `Book ${UNKNOWN_BOOK} is not in user ${USER_ALICE}'s library.` });
  });

  await t.step("Queries: _getLibrary should return an empty array if library does not exist", async () => {
    const library = await concept._getLibrary({ owner: "user:Carlos" as ID });
    assertObjectMatch(library as object, { books: [] });
  });

  await t.step("Queries: _getBookStructure should return book sections", async () => {
    const structure = await concept._getBookStructure({ book: BOOK_LORD_OF_RINGS });
    assertObjectMatch(structure as object, { sections: BOOK_STRUCTURE_LOTR.sections });
  });

  await t.step("Queries: _getBookStructure should return error if structure not found", async () => {
    const structure = await concept._getBookStructure({ book: UNKNOWN_BOOK });
    assertObjectMatch(structure as object, { error: `Book structure for ${UNKNOWN_BOOK} not found.` });
  });

  await client.close();
});

Deno.test("BookReadingConcept - Principle Trace", async () => {
  const [db, client] = await testDb();
  const concept = new BookReadingConcept(db);

  // Pre-populate book structure
  await concept.bookStructures.insertOne(BOOK_STRUCTURE_LOTR);

  // trace: a user opens a book from their library the book is divided into sections (e.g. paragraphs, pages, chapters)
  // with a defined order the user moves through the sections, and their position is stored when finished reading,
  // the book is marked completed

  // 1. User Alice adds Lord of the Rings to her library
  let result: Empty | { error: string };
  result = await concept.addToLibrary({ owner: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals(result, {}, "1. Should successfully add book to library");

  // Verify it's in the library
  let library = await concept._getLibrary({ owner: USER_ALICE });
  assertObjectMatch(library as object, { books: [BOOK_LORD_OF_RINGS] }, "1. Library should contain the book");

  // 2. User Alice opens Lord of the Rings
  result = await concept.openBook({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals(result, {}, "2. Should successfully open book and create progress");

  // Verify initial progress is at the first section
  let progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertObjectMatch(progress as object, {
    currentPlace: SECTION_LOTR_PROLOGUE,
    finished: false,
  }, "2. Progress should start at the first section");

  // 3. User Alice moves through sections
  result = await concept.nextSection({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals(result, {}, "3. Should successfully move to next section (Chap1)");
  progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals((progress as { currentPlace: ID }).currentPlace, SECTION_LOTR_CHAP1, "3. Current place should be Chap1");

  result = await concept.nextSection({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals(result, {}, "3. Should successfully move to next section (Chap2)");
  progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals((progress as { currentPlace: ID }).currentPlace, SECTION_LOTR_CHAP2, "3. Current place should be Chap2");

  // 4. User Alice jumps to the epilogue
  result = await concept.jumpTo({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS, section: SECTION_LOTR_EPILOGUE });
  assertEquals(result, {}, "4. Should successfully jump to epilogue");
  progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals((progress as { currentPlace: ID }).currentPlace, SECTION_LOTR_EPILOGUE, "4. Current place should be Epilogue");

  // 5. User Alice marks the book as finished
  result = await concept.markFinished({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertEquals(result, {}, "5. Should successfully mark book as finished");

  // Verify the book is marked finished
  progress = await concept._getProgress({ reader: USER_ALICE, book: BOOK_LORD_OF_RINGS });
  assertObjectMatch(progress as object, {
    currentPlace: SECTION_LOTR_EPILOGUE,
    finished: true,
  }, "5. Progress should show finished=true");

  await client.close();
});
```