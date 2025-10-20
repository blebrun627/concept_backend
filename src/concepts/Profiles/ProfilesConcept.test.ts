import { assertEquals } from "jsr:@std/assert";
import { testDb } from "../../utils/database.ts"; // Adjust path as necessary
import { ID } from "../../utils/types.ts"; // Adjust path as necessary
import ProfilesConcept from "./ProfilesConcept.ts";

Deno.test("Profiles Concept Tests", async (t) => {
  const [db, client] = await testDb();
  const profilesConcept = new ProfilesConcept(db);

  // Define test IDs
  const userA = "user:Alice" as ID;
  const userB = "user:Bob" as ID;
  const genreScifi = "genre:SciFi" as ID;
  const genreFantasy = "genre:Fantasy" as ID;
  const genreMystery = "genre:Mystery" as ID;
  const bookDune = "book:Dune" as ID;
  const bookLOTR = "book:LOTR" as ID;
  const bookFoundation = "book:Foundation" as ID;
  const bookNeuromancer = "book:Neuromancer" as ID;

  await t.step("createProfile: successfully creates a new profile", async () => {
    const result = await profilesConcept.createProfile({ owner: userA });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?._id, userA);
    assertEquals(profile?.genres, []);
    assertEquals(profile?.currentBooks, []);
    assertEquals(profile?.finishedBooks, []);
  });

  await t.step("createProfile: fails if profile already exists", async () => {
    await profilesConcept.createProfile({ owner: userB }); // Create once
    const result = await profilesConcept.createProfile({ owner: userB }); // Try to create again
    assertEquals(result, { error: `Profile for user ${userB} already exists.` });
  });

  await t.step("addGenre: successfully adds a genre to a profile", async () => {
    await profilesConcept.createProfile({ owner: userA }); // Ensure profile exists
    const result = await profilesConcept.addGenre({ owner: userA, genre: genreScifi });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?.genres, [genreScifi]);
  });

  await t.step("addGenre: fails if genre already exists in profile", async () => {
    await profilesConcept.createProfile({ owner: userB });
    await profilesConcept.addGenre({ owner: userB, genre: genreFantasy });
    const result = await profilesConcept.addGenre({ owner: userB, genre: genreFantasy });
    assertEquals(result, { error: `Genre ${genreFantasy} is already in user ${userB}'s profile.` });
  });

  await t.step("addGenre: fails if profile does not exist", async () => {
    const result = await profilesConcept.addGenre({ owner: "user:NonExistent" as ID, genre: genreMystery });
    assertEquals(result, { error: `Profile for user user:NonExistent not found.` });
  });

  await t.step("removeGenre: successfully removes a genre from a profile", async () => {
    await profilesConcept.createProfile({ owner: userA });
    await profilesConcept.addGenre({ owner: userA, genre: genreScifi });
    await profilesConcept.addGenre({ owner: userA, genre: genreFantasy });

    const result = await profilesConcept.removeGenre({ owner: userA, genre: genreScifi });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?.genres, [genreFantasy]);
  });

  await t.step("removeGenre: fails if genre is not in profile", async () => {
    await profilesConcept.createProfile({ owner: userB });
    await profilesConcept.addGenre({ owner: userB, genre: genreScifi });

    const result = await profilesConcept.removeGenre({ owner: userB, genre: genreMystery });
    assertEquals(result, { error: `Genre ${genreMystery} is not in user ${userB}'s profile.` });
  });

  await t.step("removeGenre: fails if profile does not exist", async () => {
    const result = await profilesConcept.removeGenre({ owner: "user:NonExistent" as ID, genre: genreScifi });
    assertEquals(result, { error: `Profile for user user:NonExistent not found.` });
  });

  await t.step("addCurrentBook: successfully adds a book to current books", async () => {
    await profilesConcept.createProfile({ owner: userA });
    const result = await profilesConcept.addCurrentBook({ owner: userA, book: bookDune });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?.currentBooks, [bookDune]);
  });

  await t.step("addCurrentBook: fails if book is already in current books", async () => {
    await profilesConcept.createProfile({ owner: userB });
    await profilesConcept.addCurrentBook({ owner: userB, book: bookLOTR });
    const result = await profilesConcept.addCurrentBook({ owner: userB, book: bookLOTR });
    assertEquals(result, { error: `Book ${bookLOTR} is already in user ${userB}'s current books.` });
  });

  await t.step("addCurrentBook: fails if book is already in finished books", async () => {
    await profilesConcept.createProfile({ owner: userA });
    await profilesConcept.addCurrentBook({ owner: userA, book: bookFoundation });
    await profilesConcept.addFinishedBook({ owner: userA, book: bookFoundation }); // Move to finished
    const result = await profilesConcept.addCurrentBook({ owner: userA, book: bookFoundation });
    assertEquals(result, { error: `Book ${bookFoundation} is already in user ${userA}'s finished books.` });
  });

  await t.step("addCurrentBook: fails if profile does not exist", async () => {
    const result = await profilesConcept.addCurrentBook({ owner: "user:NonExistent" as ID, book: bookNeuromancer });
    assertEquals(result, { error: `Profile for user user:NonExistent not found.` });
  });

  await t.step("removeCurrentBook: successfully removes a book from current books", async () => {
    await profilesConcept.createProfile({ owner: userA });
    await profilesConcept.addCurrentBook({ owner: userA, book: bookDune });
    await profilesConcept.addCurrentBook({ owner: userA, book: bookLOTR });

    const result = await profilesConcept.removeCurrentBook({ owner: userA, book: bookDune });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?.currentBooks, [bookLOTR]);
  });

  await t.step("removeCurrentBook: fails if book is not in current books", async () => {
    await profilesConcept.createProfile({ owner: userB });
    await profilesConcept.addCurrentBook({ owner: userB, book: bookLOTR });

    const result = await profilesConcept.removeCurrentBook({ owner: userB, book: bookNeuromancer });
    assertEquals(result, { error: `Book ${bookNeuromancer} is not in user ${userB}'s current books.` });
  });

  await t.step("removeCurrentBook: fails if profile does not exist", async () => {
    const result = await profilesConcept.removeCurrentBook({ owner: "user:NonExistent" as ID, book: bookNeuromancer });
    assertEquals(result, { error: `Profile for user user:NonExistent not found.` });
  });

  await t.step("addFinishedBook: successfully moves a book from current to finished", async () => {
    await profilesConcept.createProfile({ owner: userA });
    await profilesConcept.addCurrentBook({ owner: userA, book: bookDune });

    const result = await profilesConcept.addFinishedBook({ owner: userA, book: bookDune });
    assertEquals(result, {});

    const profile = await profilesConcept._getProfile({ owner: userA });
    assertEquals(profile?.currentBooks, []);
    assertEquals(profile?.finishedBooks, [bookDune]);
  });

  await t.step("addFinishedBook: fails if book is not in current books", async () => {
    await profilesConcept.createProfile({ owner: userB });
    await profilesConcept.addCurrentBook({ owner: userB, book: bookLOTR }); // Add one
    // Try to finish a book not being read
    const result = await profilesConcept.addFinishedBook({ owner: userB, book: bookNeuromancer });
    assertEquals(result, { error: `Book ${bookNeuromancer} is not in user ${userB}'s current books, cannot mark as finished.` });
  });

  await t.step("addFinishedBook: fails if profile does not exist", async () => {
    const result = await profilesConcept.addFinishedBook({ owner: "user:NonExistent" as ID, book: bookNeuromancer });
    assertEquals(result, { error: `Profile for user user:NonExistent not found.` });
  });

  // Test the principle
  await t.step("Principle Trace: User profile creation and updates for reading history and interests", async () => {
    const alice = "user:AliceP" as ID;
    const s_fi = "genre:ScienceFiction" as ID;
    const fantasy = "genre:Fantasy" as ID;
    const history = "genre:History" as ID;
    const book_1 = "book:A Great Scifi Read" as ID;
    const book_2 = "book:An Epic Fantasy" as ID;
    const book_3 = "book:Historical Account" as ID;
    const book_4 = "book:Another Scifi Classic" as ID;

    // 1. Alice creates her profile
    const createRes = await profilesConcept.createProfile({ owner: alice });
    assertEquals(createRes, {}, "Alice should be able to create her profile");

    // Verify initial profile state
    let aliceProfile = await profilesConcept._getProfile({ owner: alice });
    assertEquals(aliceProfile?.genres, [], "Alice's profile genres should be empty initially");
    assertEquals(aliceProfile?.currentBooks, [], "Alice's profile current books should be empty initially");
    assertEquals(aliceProfile?.finishedBooks, [], "Alice's profile finished books should be empty initially");

    // 2. Alice adds genres she enjoys
    const addGenre1Res = await profilesConcept.addGenre({ owner: alice, genre: s_fi });
    assertEquals(addGenre1Res, {}, "Alice should be able to add Science Fiction genre");
    const addGenre2Res = await profilesConcept.addGenre({ owner: alice, genre: fantasy });
    assertEquals(addGenre2Res, {}, "Alice should be able to add Fantasy genre");

    // Verify genres
    const aliceGenres = await profilesConcept._getGenres({ owner: alice });
    assertEquals(aliceGenres, { genres: [s_fi, fantasy] }, "Alice's profile should have Science Fiction and Fantasy genres");

    // 3. Alice starts reading some books
    const addCurrent1Res = await profilesConcept.addCurrentBook({ owner: alice, book: book_1 });
    assertEquals(addCurrent1Res, {}, "Alice should be able to add 'A Great Scifi Read' to current books");
    const addCurrent2Res = await profilesConcept.addCurrentBook({ owner: alice, book: book_2 });
    assertEquals(addCurrent2Res, {}, "Alice should be able to add 'An Epic Fantasy' to current books");

    // Verify current books
    const aliceCurrentBooks = await profilesConcept._getCurrentBooks({ owner: alice });
    assertEquals(aliceCurrentBooks, { currentBooks: [book_1, book_2] }, "Alice's profile should show two current books");

    // 4. Alice finishes a book
    const finishBook1Res = await profilesConcept.addFinishedBook({ owner: alice, book: book_1 });
    assertEquals(finishBook1Res, {}, "Alice should be able to mark 'A Great Scifi Read' as finished");

    // Verify books moved
    aliceProfile = await profilesConcept._getProfile({ owner: alice }); // Re-fetch for updated state
    assertEquals(aliceProfile?.currentBooks, [book_2], "Alice's current books should now only contain 'An Epic Fantasy'");
    assertEquals(aliceProfile?.finishedBooks, [book_1], "Alice's finished books should now contain 'A Great Scifi Read'");

    // 5. Alice adds another genre and starts a new book
    await profilesConcept.addGenre({ owner: alice, genre: history });
    await profilesConcept.addCurrentBook({ owner: alice, book: book_3 });

    // Verify final state for the principle demonstration
    aliceProfile = await profilesConcept._getProfile({ owner: alice });
    assertEquals(aliceProfile?.genres.sort(), [s_fi, fantasy, history].sort(), "Alice's profile should have all three genres");
    assertEquals(aliceProfile?.currentBooks.sort(), [book_2, book_3].sort(), "Alice's current books should contain 'An Epic Fantasy' and 'Historical Account'");
    assertEquals(aliceProfile?.finishedBooks, [book_1], "Alice's finished books should contain 'A Great Scifi Read'");
  });

  await client.close();
});