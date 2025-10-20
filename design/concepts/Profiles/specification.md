# concept: Profiles
* **concept**: Profiles
* ***purpose**: Creates a representation of each reader's identity, interests, and history
* ***principle**: Each user has a profile that includes genres they enjoy, books they've completed and book they're still reading. This profile helps others learn about them and is used for other features like matching & recommendations.
* **state**:
  *a set of `Profiles` with 
    * an `owner` of type `User`
    * a set of `Genres` of type `Genre`
    * a set of `finishedBooks` of type `Book`
    * a set of `currentBooks` of type `Book`
* **actions**:
  * `createProfile(owner: User)`
    * **requires**: owner does not already have a profile
    * **effects**: creates a new Profile with empty genres, finishedBooks, and currentBooks
  * `addGenre(owner: User, genre: Genre)`
    * **requires**: owner has a Profile and genre is not already in genres
    * **effects**: adds genre to owner's genres
  * `removeGenre(owner: User, genre: Genre)`
    * **requires**: owner has a Profile and genre is one of their genres
    * **effects**: removes genre form owner's genres
  * `addCurrentBook(owner: User, book: Book)`
    * **requires**: owner has a profile and book is not in currentBooks or finishedBooks
    * **effects**: add book to owner's currentBooks
  * `removeCurrentBook(owner: User, book: Book)`
    * **requires**: owner has a Profile and book in currentBooks
    * **effects**: remove book from owner's currentBooks
  * `addFinishedBook(owner: User, book: Book)`
    * **requires**: owner has a Profile and book in currentBooks
    * **effects**: add book to owner's finishedBooks