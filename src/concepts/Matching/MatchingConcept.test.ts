import { assertEquals, assertExists, assertNotEquals, assertArrayIncludes } from "jsr:@std/assert";
import { testDb } from "../../utils/database.ts"; // Adjust path as necessary
import MatchingConcept from "./MatchingConcept.ts";
import { ID } from "../../utils/types.ts";

// Declare collection prefix, matching the one in MatchingConcept.ts
const PREFIX = "Matching" + ".";

type User = ID;
type Book = ID;

// Mock user and book IDs for testing
const userA = "user:Alice" as ID;
const userB = "user:Bob" as ID;
const userC = "user:Charlie" as ID;
const userD = "user:David" as ID; // For nearbyMatches
const book1 = "book:Dune" as ID;
const book2 = "book:Foundation" as ID;
const book3 = "book:1984" as ID;

Deno.test("MatchingConcept", async (t) => {
  const [db, client] = await testDb();
  const concept = new MatchingConcept(db);

  try {
    // Helper to add finished book for setup, mimicking how an external system/sync would mark a book as finished.
    const addFinishedBook = async (user: User, book: Book) => {
      const result = await concept._addFinishedBook({ user, book });
      if ("error" in result) {
        throw new Error(`Failed to add finished book: ${result.error}`);
      }
    };

    // Helper to ensure clean state before specific complex test steps
    const cleanCollections = async () => {
      await concept.matches.deleteMany({});
      await concept.finishedBooks.deleteMany({});
    };

    await t.step("generateMatches: should prevent generation if owner hasn't finished the book", async () => {
      await cleanCollections();
      const result = await concept.generateMatches({ owner: userA, book: book1 });
      assertExists((result as { error: string }).error, "Expected an error message");
      assertEquals((result as { error: string }).error, `User ${userA} has not finished book ${book1}.`);
    });

    await t.step("generateMatches: should create a pending match between two co-finishers", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);

      const result = await concept.generateMatches({ owner: userA, book: book1 });
      if ("error" in result) throw result.error;

      assertEquals(result.suggested.length, 1, "Expected one suggested match");
      const match = result.suggested[0];
      assertEquals(match.userA, userA);
      assertEquals(match.userB, userB);
      assertEquals(match.book, book1);
      assertEquals(match.status, "pending");

      // Verify the match is stored in the database
      const storedMatches = await concept._getMatchesForUser({ userId: userA });
      assertEquals(storedMatches.length, 1);
      assertEquals(storedMatches[0]._id, match._id);
    });

    await t.step("generateMatches: should not create duplicate matches if one already exists", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);

      // First call generates the match
      const { suggested: firstSuggestions } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      assertEquals(firstSuggestions.length, 1);

      // Second call should not generate new matches for the same pair and book
      const { suggested: secondSuggestions } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      assertEquals(secondSuggestions.length, 0, "Expected no new matches as one already exists");

      // Verify the total number of matches in the DB is still one
      const allMatches = await concept.matches.find({}).toArray();
      assertEquals(allMatches.length, 1);
    });

    await t.step("generateMatches: should create matches for all relevant co-finishers", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book2);
      await addFinishedBook(userB, book2);
      await addFinishedBook(userC, book2);

      const result = await concept.generateMatches({ owner: userA, book: book2 });
      if ("error" in result) throw result.error;

      assertEquals(result.suggested.length, 2, "Expected two suggested matches for userA");
      const userB_match = result.suggested.find(m => m.userB === userB);
      const userC_match = result.suggested.find(m => m.userB === userC);

      assertExists(userB_match);
      assertExists(userC_match);
      assertEquals(userB_match.status, "pending");
      assertEquals(userC_match.status, "pending");

      // Verify database state
      const matchesForUserA = await concept._getMatchesForUser({ userId: userA });
      assertEquals(matchesForUserA.length, 2);
    });

    await t.step("acceptMatch: should prevent acceptance if match doesn't exist", async () => {
      await cleanCollections();
      const nonExistentMatchId = "match:nonexistent" as ID;
      const result = await concept.acceptMatch({ owner: userA, matchId: nonExistentMatchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${nonExistentMatchId} not found.`);
    });

    await t.step("acceptMatch: should prevent acceptance if owner is not part of the match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      const result = await concept.acceptMatch({ owner: userD, matchId: matchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userD} is not part of match ${matchId}.`);
    });

    await t.step("acceptMatch: should allow a user to accept a pending match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      const acceptResult = await concept.acceptMatch({ owner: userA, matchId: matchId });
      assertEquals(acceptResult, {}, "Expected successful acceptance");

      const updatedMatch = await concept.matches.findOne({ _id: matchId });
      assertExists(updatedMatch);
      assertEquals(updatedMatch.status, "accepted");
    });

    await t.step("acceptMatch: should prevent acceptance if match is not pending", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      await concept.acceptMatch({ owner: userA, matchId: matchId }); // Now 'accepted'

      const result = await concept.acceptMatch({ owner: userA, matchId: matchId }); // Try to accept again
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${matchId} is not in 'pending' status.`);
    });

    await t.step("rejectMatch: should prevent rejection if match doesn't exist", async () => {
      await cleanCollections();
      const nonExistentMatchId = "match:nonexistent" as ID;
      const result = await concept.rejectMatch({ owner: userA, matchId: nonExistentMatchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${nonExistentMatchId} not found.`);
    });

    await t.step("rejectMatch: should prevent rejection if owner is not part of the match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      const result = await concept.rejectMatch({ owner: userD, matchId: matchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userD} is not part of match ${matchId}.`);
    });

    await t.step("rejectMatch: should allow a user to reject a pending match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id; // Match is 'pending'

      const rejectResult = await concept.rejectMatch({ owner: userA, matchId: matchId });
      assertEquals(rejectResult, {}, "Expected successful rejection");

      const updatedMatch = await concept.matches.findOne({ _id: matchId });
      assertExists(updatedMatch);
      assertEquals(updatedMatch.status, "rejected");
    });

    await t.step("rejectMatch: should allow a user to reject an accepted match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      await concept.acceptMatch({ owner: userA, matchId: matchId }); // Set to 'accepted'

      const rejectResult = await concept.rejectMatch({ owner: userA, matchId: matchId });
      assertEquals(rejectResult, {}, "Expected successful rejection");

      const updatedMatch = await concept.matches.findOne({ _id: matchId });
      assertExists(updatedMatch);
      assertEquals(updatedMatch.status, "rejected");
    });

    await t.step("rejectMatch: should prevent re-rejection if match is already rejected", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;

      await concept.rejectMatch({ owner: userA, matchId: matchId }); // First rejection

      const result = await concept.rejectMatch({ owner: userA, matchId: matchId }); // Second rejection
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${matchId} is already 'rejected'.`);
    });

    await t.step("explainMatch: should prevent explanation if match doesn't exist", async () => {
      await cleanCollections();
      const nonExistentMatchId = "match:nonexistent" as ID;
      const result = await concept.explainMatch({ requester: userA, matchId: nonExistentMatchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${nonExistentMatchId} not found.`);
    });

    await t.step("explainMatch: should prevent explanation if requester is not part of the match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;
      await concept.acceptMatch({ owner: userA, matchId: matchId }); // Make it accepted

      const result = await concept.explainMatch({ requester: userD, matchId: matchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userD} is not part of match ${matchId}.`);
    });

    await t.step("explainMatch: should prevent explanation if match is not accepted", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id; // Match is 'pending'

      const result = await concept.explainMatch({ requester: userA, matchId: matchId });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `Match ${matchId} is not in 'accepted' status.`);
    });

    await t.step("explainMatch: should generate and store explanation for an accepted match", async () => {
      await cleanCollections();
      await addFinishedBook(userA, book1);
      await addFinishedBook(userB, book1);
      const { suggested } = await concept.generateMatches({ owner: userA, book: book1 }) as { suggested: any[] };
      const matchId = suggested[0]._id;
      await concept.acceptMatch({ owner: userA, matchId: matchId }); // Set to 'accepted'

      const explainResult = await concept.explainMatch({ requester: userA, matchId: matchId });
      if ("error" in explainResult) throw explainResult.error;

      assertExists(explainResult.explanation);
      assertNotEquals(explainResult.explanation, "", "Explanation should not be empty");
      assertArrayIncludes(explainResult.explanation.split(' '), ["You", "and", userB, "both", "recently", "finished", `"${book1}".`]);

      // Verify explanation is stored in the database
      const updatedMatch = await concept.matches.findOne({ _id: matchId });
      assertExists(updatedMatch);
      assertEquals(updatedMatch.explanation, explainResult.explanation);
    });

    await t.step("nearbyMatches: should prevent finding nearby matches if owner hasn't finished book", async () => {
      await cleanCollections();
      const result = await concept.nearbyMatches({ owner: userD, book: book3 });
      assertExists((result as { error: string }).error);
      assertEquals((result as { error: string }).error, `User ${userD} has not finished book ${book3}.`);
    });

    await t.step("nearbyMatches: should return mock candidates when owner has finished the book", async () => {
      await cleanCollections();
      await addFinishedBook(userD, book3); // UserD finishes book3

      const result = await concept.nearbyMatches({ owner: userD, book: book3 });
      if ("error" in result) throw result.error;

      assertExists(result.candidates);
      assertNotEquals(result.candidates.length, 0, "Expected mock candidates");
      // The implementation hardcodes specific mock candidates, so we check for one of them
      assertArrayIncludes(result.candidates, [userC], "Expected mock candidates to include userC");
    });

    await t.step("Trace: Principle fulfillment", async () => {
      await cleanCollections();
      console.log("\n--- Trace: Demonstrating Principle Fulfillment ---");

      // Principle: When a user finishes a book, the system looks for others who did the same recently.
      // Setup: Users finish books
      await addFinishedBook(userA, book1);
      console.log(`[Trace] ${userA} finished ${book1}`);
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate slight time difference
      await addFinishedBook(userB, book1);
      console.log(`[Trace] ${userB} finished ${book1}`);
      await addFinishedBook(userC, book1);
      console.log(`[Trace] ${userC} finished ${book1}`);
      await addFinishedBook(userD, book2); // User D finishes a different book
      console.log(`[Trace] ${userD} finished ${book2}`);

      // Users can accept or decline these matches.
      // Scenario 1: User A generates matches and accepts one with User B.
      console.log(`\n[Trace] ${userA} generates matches for ${book1}`);
      const generateResult = await concept.generateMatches({ owner: userA, book: book1 });
      if ("error" in generateResult) throw generateResult.error;
      assertEquals(generateResult.suggested.length, 2, "Expected matches for B and C");

      const matchAB = generateResult.suggested.find(m => m.userB === userB);
      const matchAC = generateResult.suggested.find(m => m.userB === userC);
      assertExists(matchAB, "Match with B should be suggested");
      assertExists(matchAC, "Match with C should be suggested");
      assertEquals(matchAB.status, "pending");
      assertEquals(matchAC.status, "pending");
      console.log(`[Trace] Generated pending match ${matchAB._id} (${userA}-${userB}) and ${matchAC._id} (${userA}-${userC})`);

      console.log(`\n[Trace] ${userA} accepts match ${matchAB._id} with ${userB}`);
      const acceptResult = await concept.acceptMatch({ owner: userA, matchId: matchAB._id });
      assertEquals(acceptResult, {}, "Acceptance failed");
      let storedMatchAB = await concept.matches.findOne({ _id: matchAB._id });
      assertEquals(storedMatchAB?.status, "accepted");
      console.log(`[Trace] Match ${matchAB._id} status is now 'accepted'`);

      // Scenario 2: User A rejects match with User C
      console.log(`\n[Trace] ${userA} rejects match ${matchAC._id} with ${userC}`);
      const rejectResult = await concept.rejectMatch({ owner: userA, matchId: matchAC._id });
      assertEquals(rejectResult, {}, "Rejection failed");
      let storedMatchAC = await concept.matches.findOne({ _id: matchAC._id });
      assertEquals(storedMatchAC?.status, "rejected");
      console.log(`[Trace] Match ${matchAC._id} status is now 'rejected'`);

      // Optionally, the user may ask the system to provide an explanation of a proposed or active match.
      console.log(`\n[Trace] ${userA} requests explanation for accepted match ${matchAB._id}`);
      const explainResult = await concept.explainMatch({ requester: userA, matchId: matchAB._id });
      if ("error" in explainResult) throw explainResult.error;
      assertExists(explainResult.explanation);
      console.log(`[Trace] Explanation received: "${explainResult.explanation}"`);
      storedMatchAB = await concept.matches.findOne({ _id: matchAB._id });
      assertExists(storedMatchAB?.explanation); // Verify explanation is stored

      // If there aren't many co-finishers of a book at a time, a user may request the "next closest candidates"
      console.log(`\n[Trace] ${userD} (finished ${book2}) requests nearby candidates, assuming sparse co-finishers for ${book2}`);
      const nearbyResult = await concept.nearbyMatches({ owner: userD, book: book2 });
      if ("error" in nearbyResult) throw nearbyResult.error;
      assertExists(nearbyResult.candidates);
      assertNotEquals(nearbyResult.candidates.length, 0, "Expected nearby candidates list");
      console.log(`[Trace] Nearby candidates for ${userD}: ${nearbyResult.candidates.join(", ")}`);

      console.log("\n--- Principle Fulfillment Trace Complete ---");
    });

  } finally {
    // Ensure the client is closed after all tests are run
    await client.close();
  }
});