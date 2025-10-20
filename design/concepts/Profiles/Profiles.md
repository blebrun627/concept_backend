  &emsp;**concept** Profiles[User, Genre, Book]\
&emsp;**purpose** Creates a representation of each reader's identity, interests, and history\
&emsp;**principle** \
&emsp;&emsp;Each user has a profile that includes genres they enjoy, books they've completed and book they'r still reading\
&emsp;&emsp;this profile helps others learn about them and is used for other features like matching & recommendations\
&emsp;**state**\
&emsp;&emsp;a set of Profiles with \
&emsp;&emsp;&emsp;an owner User\
&emsp;&emsp;&emsp;a set of Genres\
&emsp;&emsp;&emsp;a set of finishedBooks Book\
&emsp;&emsp;&emsp;a set of currentBooks Book\
&emsp;**actions**\
&emsp;&emsp;createProfile(owner: User)\
&emsp;&emsp;&emsp;**requires** owner does not already have a profile\
&emsp;&emsp;&emsp;**effects** creates a new Profile with empty genres, finishedBooks, and currentBooks<br /><br />
&emsp;&emsp;addGenre(owner: User, genre: Genre)\
&emsp;&emsp;&emsp;**requires** owner has a Profile\
&emsp;&emsp;&emsp;**effects** adds genre to owner's genres<br /><br />
&emsp;&emsp;removeGenre(owner: User, genre: Genre)\
&emsp;&emsp;&emsp;**requires** owner has a Profile and genre is one of their genres\
&emsp;&emsp;&emsp;**effects** remove genre form owner's genres<br /><br />
&emsp;&emsp;addCurrentBook(owner: User, book: Book)\
&emsp;&emsp;&emsp;**requires** owner has a profile and book is not in currentBooks or finsihedBooks\
&emsp;&emsp;&emsp;**effects** add book to owner's currentBooks<br /><br />
&emsp;&emsp;removeCurrentBook(owner: User, book: Book)\
&emsp;&emsp;&emsp;**requires** owner has a Profile and book in currentBooks\
&emsp;&emsp;&emsp;**effects** remove book from owner's currentBooks<br /><br />
&emsp;&emsp;addFinsihedBook(owner: User, book: Book)\
&emsp;&emsp;&emsp;**requires** owner has a Profile and book in currentBooks\
&emsp;&emsp;&emsp;**effects** add book to owner's finsihedBooks