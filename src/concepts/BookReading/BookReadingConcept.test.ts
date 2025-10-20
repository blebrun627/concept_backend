
// file: src/BookReading/BookReadingConcept.test.ts
import { Collection, Db } from "npm:mongodb";
import { assertEquals, assertNotEquals, assertObjectMatch } from "jsr:@std/assert";
import { testDb } from "@utils/database.ts";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

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

// Helper to manually insert a book structure for testing
async function insertBookStructure(
  bookStructuresCollection: Collection<any>,
  bookId: Book,
  sections: Section[],
) {
  await bookStructuresCollection.insertOne({
    _id: bookId,
    sections: sections,
  });
}

Deno.test("BookReadingConcept", async (t) => {
  const [db, client] = await testDb();
  const({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
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
    await concept.jumpTo({ reader: TEST_USER_ALICE, book: TEST_BOOK_LOTR, section: TEST_SECTION_LOTR2 }); // Ensure progress and not finished
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
    await concept.addToLibrary({ owner: TEST_USER_BOB, book: TEST_BOOK_HP });
    await concept.openBook({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    const initialProgress = await concept.progresses.findOne({ reader: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertNotEquals(initialProgress, null, "Progress should exist before removal");

    const result = await concept.removeFromLibrary({ owner: TEST_USER_BOB, book: TEST_BOOK_HP });
    assertEquals(result, {});

    const library = await concept.libraries.findOne({ _id: TEST_USER_BOB });
    assertEquals(library, null, "Library should be removed if it's empty, or book removed from array");
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
    const result = await concept._getLibrary({ owner: TEST_USER_ALICE });
    assertEquals(result, { books: [TEST_BOOK_HP, TEST_BOOK_LOTR].sort() }); // Assuming previous tests added these
  });

  await t.step("_getLibrary should return empty array for user with no library", async () => {
    const result = await concept._getLibrary({ owner: "user:NoLibrary" as ID });
    assertEquals(result, { books: [] });
  });

  await t.step("_getProgress should return current progress", async () => {
    // Ensure some progress exists
    await concept.openBook({ reader: TEST_USER_ALICE, book: TEST_BOOK_HP });
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
    await insertBookStructure(concept.bookStructures, TRACE_BOOK, [
      TRACE_SECTION_1,
      TRACE_SECTION_2,
      TRACE_SECTION_3,
    ]);

    // 2. A user opens a book from their library.
    await concept.addToLibrary({ owner: TRACE_USER, book: TRACE_BOOK });
    const openResult = await concept.openBook({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(openResult, {});

    let progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_1, "Initial current place should be first section");
    assertEquals(progress?.finished, false);

    // 3. The user moves through the sections, and their position is stored.
    await concept.nextSection({ reader: TRACE_USER, book: TRACE_BOOK });
    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_2, "Should move to next section");

    await concept.jumpTo({ reader: TRACE_USER, book: TRACE_BOOK, section: TRACE_SECTION_3 });
    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.currentPlace, TRACE_SECTION_3, "Should jump to specified section");

    // 4. When finished reading, the book is marked completed.
    const markFinishedResult = await concept.markFinished({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(markFinishedResult, {});

    progress = await concept.progresses.findOne({ reader: TRACE_USER, book: TRACE_BOOK });
    assertEquals(progress?.finished, true, "Book should be marked as finished");

    // Verify final state
    const library = await concept.libraries.findOne({ _id: TRACE_USER });
    assertEquals(library?.books.includes(TRACE_BOOK), true);
    assertEquals(progress?.reader, TRACE_USER);
    assertEquals(progress?.book, TRACE_BOOK);
    assertEquals(progress?.currentPlace, TRACE_SECTION_3);
    assertEquals(progress?.finished, true);
  });

  await client.close();
});