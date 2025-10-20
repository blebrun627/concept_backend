---
timestamp: 'Sun Oct 19 2025 23:36:31 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_233631.99e9834a.md]]'
content_id: 99f891b4e8cbc54243ed0596546c9b1fa08b81103276fbeb32a0038a6c8f8130
---

# concept: Matching

* \***concept**: Matching
* \***purpose**: Connect readers who recently finished the same book. Optionally use an LLM to explain the match, generate first-message prompts, or suggest the closest alternatives when exact matches are sparse.
* \***principle**: When a user finishes a book, the system look for others who did the same recently. Users can accept or decline these matches. Accepting a match keeps it active, whiel rejecting a match deactivates it. Optionally, the user may ask the system to provde an explanation of a proposed or active match. If there aren't many co-finishers of a book at a time, a user may request the "next closest candidates", based on author, sub-genre, themes, or profile overlaps. If AI is unavailable or disabled, matching behavior is unchanged.
* **state**:
  * a set of `Matches` with
    * a `userA` of type `User`
    * a `userB` of type `User`
    * a `book` of type `Book`
    * a `status` of type `Status`
    * an optional `explanation` of type `Text`
  * a set of `FinishedBooks` with
    * a `user` of type `User`
    * a `book` of type `Book`
    * a `finishedAt` of type `Date`
* **actions**:
  * `generateMatches(owner: User, book: Book): (suggested: set of Matches)`
    * **requires**: owner has a Profile and has finished the book
    * **effects**: creates a new match with userA = owner, userB = other, book = book, status = pending. This excludes any pairing that already have a match for book. Returns the set of new Matches
  * `acceptMatch(owner: User, (optional) match: Match)`
    * **requires**: match exixts and owner is either userA or userB and status = pending\\
    * **effects**: set active = True
  * `rejectMatch(owner: User, match: Match)`
    * **requires**: match exists and owner is either userA or userB and status = true
    * **effects**: set active = false
  * `explainMatch(requester: User, match: Match): (explanation: Text)`
    * **requires**: match exists and the requestor is either userA or userB and active = true\\
    * **effects**: produce a 1-3 sentence reasoning using only public profile fields and the shared book (if applicable) and store in match.explanation
  * `nearbyMatches(owner: User, book: Book): (candidates: set of User)`
    * **requires**: owner has a profile and has finsihed book
    * **effects**: return a set of suggested users who closely match the interests of owner.
