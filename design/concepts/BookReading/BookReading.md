&emsp;**concept** BookReading[User, Book, Section]\
&emsp;**purpose** Lets users read a book in-app and track their progress\
&emsp;**principle** \
&emsp;&emsp;a user opens a book from their library\
&emsp;&emsp;the book is divided into sections (e.g. paragraphs, pages, chapters) with a defined order\
&emsp;&emsp;the user moves through the sections, and their position is stored\
&emsp;&emsp;when finished reading, the book is marked completed\
&emsp;**state**\
&emsp;&emsp;a set of Libraries with \
&emsp;&emsp;&emsp;owner User\
&emsp;&emsp;&emsp;a set of Books\
&emsp;&emsp;a set of BookStructures with \
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;section list of Section\
&emsp;&emsp;a set of Progresses with\
&emsp;&emsp;&emsp;a reader User\
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;a currentPlace Section\
&emsp;&emsp;&emsp;a finished Flag\
&emsp;**actions**\
&emsp;&emsp;addToLibrary(owner: User, book: Book)\
&emsp;&emsp;&emsp;**requires** book is not already in owner's library\
&emsp;&emsp;&emsp;**effects** add book to owner's library<br /><br />
&emsp;&emsp;openBook(reader: User, book: Book)\
&emsp;&emsp;&emsp;**requires** book is in reader's library\
&emsp;&emsp;&emsp;**effects** if a Progress exists for the reader and book already, do nothing\
&emsp;&emsp;&emsp;&emsp; else create Progress with currentPlace being the first section of the book and finished = false<br /><br />
&emsp;&emsp;jumpTo(reader: User, book: Book, section: Section)\
&emsp;&emsp;&emsp;**requires** set Progress.currentPlace to section\
&emsp;&emsp;&emsp;**effects** <br /><br />
&emsp;&emsp;nextSection(reader: User, book: Book)\
&emsp;&emsp;&emsp;**requires** Progress exists for the reader and book and a subsequent section exists for the book\
&emsp;&emsp;&emsp;**effects** currentPlace is set to the next section in the book's section list<br /><br />
&emsp;&emsp;markFinished(reader: User, book: Book)\
&emsp;&emsp;&emsp;**requires** Progress exists for the reader and book, and finished = false\
&emsp;&emsp;&emsp;**effects** set finished = true<br /><br />
&emsp;&emsp;resetProgress(reader: User, book: Book)\
&emsp;&emsp;&emsp;**requires** Progress exists for the reader and book\
&emsp;&emsp;&emsp;**effects** set currentPlace to the first section of the book and finsihed = false<br /><br />
&emsp;&emsp;removeFromLibrary(owner: User, book: Book)\
&emsp;&emsp;&emsp;**requires** book is in the owner's library\
&emsp;&emsp;&emsp;**effects** remove the book from the owner's library and remove Progress for the owner and book if it exists