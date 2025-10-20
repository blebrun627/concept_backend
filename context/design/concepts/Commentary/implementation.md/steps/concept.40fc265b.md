---
timestamp: 'Sun Oct 19 2025 23:30:45 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_233045.2acb10d0.md]]'
content_id: 40fc265b2609afdac3dda9bc136286cf182066fbbb7e21c725f97ab34f880170
---

# concept: Commentary

* \***concept**: Commentary
* \***purpose**: Allows readers to comment, reply, and react to parts of a book
* \***principle**: Every section of the book has an associated discussion thread. Users can add comments, reply to others, and leave reactions
* \***state**:
  * a set of `Threads` with
    * a `book` of type `Book`
    * a `section` of type `Section`
    * a set of `Comments`
  * a set of `Comments` with
    * a `author` of type `User`
    * a `body` of type `Text`
    * an optional `parent` of type `Comment`
    * a set of `Reactions`
  * a set of `Reaction` with
    * a `reactor` of type `User`
    * a `target` of type `Comment`
    * a `type` of type `ReactionType`
* \***actions**:
  * `postComment(author: User, book: Book, section: Section, body: Text): (comment: Comment)`
    * **requires**: section belongs to the book
    * **effects**: if Thread already exists for book and section, add a new comment to it. Else create a new Thread, then add the comment. Return the comment
  * `reply(author: Author, parent: Comment, body; Text): (comment: Comment)\`
    * **requires**: parent exists
    * **effects**: create a new Comment with parent = parent in the same thread as the parent. Return the comment
  * `react(reactor: User, target: Comment, type: ReactionType): (reaction: Reaction)`
    * **requires**: target exists and there's no existing reaction with (reactor, target, type)
    * **effects**: creates a new Reaction with reactor, target and type, then attaches it to target. Return the reaction
  * `deleteComment(requestor: User, target: Comment)`
    * **requires**: target exists and requestor is the author of the target
    * **effects**: remove target and all its decendant replies for its Thread
