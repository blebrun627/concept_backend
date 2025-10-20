---
timestamp: 'Sun Oct 19 2025 23:05:04 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_230504.327f3615.md]]'
content_id: 515240e61ff0070c803d1bde80291b1222ba83383c07cd0e3b6c194be418aad6
---

# concept: BookReading

* **concept**: BookReading
* \***purpose**: Lets users read a book in-app and track their progress
* \***principle**: a user opens a book from their library the book is divided into sections (e.g. paragraphs, pages, chapters) with a defined order the user moves through the sections, and their position is stored when finished reading, the book is marked completed
* **state**:
  * a set of `Libraries` with
    * an `owner` of type `User`
    * a set of `Books`
  * a set of `BookStructures` with
    * a `book` of type `Book`
    * a set of `Sections`
  * a set of `Progresses` with
    * a `reader` of type `User`
    * a `book` of type `Book`
    * a `currentPlace` of type `Section`
    * a `finished` of type `Flag`
* \***actions**:
  * `addToLibrary(owner: User, book: Book)`
    * **requires**: book is not already in owner's library
    * **effects**: add book to owner's library
  * `openBook(reader: User, book: Book)`
    * **requires**: book is in reader's library
    * **effects**: if a Progress exists for the reader and book already, do nothing. Else create Progress with currentPlace being the first section of the book and finished = false
  * `jumpTo(reader: User, book: Book, section: Section`
    * **requires**: book is in reader's library and Section exists for book
    * **effects**: set Progress.currentPlace to section
  * `nextSection(reader: User, book: Book)`
    * **requires**: Progress exists for the reader and book and a subsequent section exists for the book
    * **effects**: currentPlace is set to the next section in the book's section list
  * `markFinished(reader: User, book: Book)`
    * **requires**: Progress exists for the reader and book, and finished = false
    * **effects**: set finished = true
  * `resetProgress(reader: User, book: Book)`
    * **requires**: Progress exists for the reader and book
    * **effects**: set currentPlace to the first section of the book and finsihed = false
  * `removeFromLibrary(owner: User, book: Book)`
    * **requires**: book is in owner's library
    * **effects**: remove book from owner's library and remove Progress for the owner and book if it exists
