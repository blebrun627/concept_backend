&emsp;**concept** Commentary[User, Book, Section, Text, ReactionType]\
&emsp;**purpose** Allows readers to comment, reply, and react to parts of a book\
&emsp;**principle** \
&emsp;&emsp;Every section of the book has an associated discussion thread.\
&emsp;&emsp;Users can add comments, reply to others, and leave reactions\
&emsp;**state**\
&emsp;&emsp;a set of Threads with \
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;a section Section\
&emsp;&emsp;&emsp;a set of Comments\
&emsp;&emsp;a set of Comments with\
&emsp;&emsp;&emsp;an author User\
&emsp;&emsp;&emsp;a body Text\
&emsp;&emsp;&emsp;a parent Comment?\
&emsp;&emsp;&emsp;a set of Reactions\
&emsp;&emsp;a set of Reaction with\
&emsp;&emsp;&emsp;a reactor User\
&emsp;&emsp;&emsp;a target Comment\
&emsp;&emsp;&emsp;a type ReactionType\
&emsp;**actions**\
&emsp;&emsp;postComment(author: User, book: Book, section: Section, body: Text): (comment: Comment)\
&emsp;&emsp;&emsp;**requires** section belongs to the book\
&emsp;&emsp;&emsp;**effects** if Thread already exists for book and section, add a new comment to it\
&emsp;&emsp;&emsp;&emsp; else create a new Thread, then add the comment. Return the comment<br /><br />
&emsp;&emsp;reply(author: Author, parent: Comment, body; Text): (comment: Comment)\
&emsp;&emsp;&emsp;**requires** parent exists\
&emsp;&emsp;&emsp;**effects** create a new Comment with parent = parent in the same thread as the parent. Return the comment<br /><br />
&emsp;&emsp;react(reactor: User, target: Comment, type: ReactionType): (reaction: Reaction)\
&emsp;&emsp;&emsp;**requires** target exists and there's no existing reaction with (reactor, target, type)\
&emsp;&emsp;&emsp;**effects** creates a new Reaction with reactor, target and type, then attaches it to target. Return the reaction<br /><br />
&emsp;&emsp;deleteComment(requestor: User, target: Comment): (?)\
&emsp;&emsp;&emsp;**requires** target exists and requestor is the author of the target\
&emsp;&emsp;&emsp;**effects** remove target and all its decendant replies for its Thread