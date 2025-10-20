*Original Concept*

&emsp;**concept** Matching[User, Book, Genre]\
&emsp;**purpose** connect readers who recently finished the same book\
&emsp;**principle** \
&emsp;&emsp;When a user finishes a book, the system look for others who did thre same recently\
&emsp;&emsp;Users can accept or decline these matches\
&emsp;&emsp;Accepting a match keeps it active, whiel rejecting a match deactivates it\
&emsp;**state**\
&emsp;&emsp;a set of Matches with \
&emsp;&emsp;&emsp;a userA User\
&emsp;&emsp;&emsp;a userB User\
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;an active Flag\
&emsp;**actions**\
&emsp;&emsp;generateMatches(owner: User, book: Book): (suggested: set of Matches)\
&emsp;&emsp;&emsp;**requires** owner has a Profile and at leaast one finished book\
&emsp;&emsp;&emsp;**effects** creates a new match with userA = owner, userB = other, book = book, active = true\
&emsp;&emsp;&emsp;&emsp;this excludes any pairing that already have a match for book. Returns the set of new Matches <br /><br />
&emsp;&emsp;acceptMatch(owner: User, match: Match)\
&emsp;&emsp;&emsp;**requires** match exixts and owner is either userA or userB and active = true\
&emsp;&emsp;&emsp;**effects** set active = True<br /><br />
&emsp;&emsp;rejectMatch(owner: User, match: Match)\
&emsp;&emsp;&emsp;**requires** match exists and owner is either userA or userB and active = true\
&emsp;&emsp;&emsp;**effects** set active = false\

*Augmented Concept*

&emsp;**concept** Matching[User, Book, Genre, Status]\
&emsp;**purpose**\
&emsp;&emsp;Connect readers who recently finished the same book\
&emsp;&emsp;Optionally use an LLM to explain the match, generate first-message prompts, or suggest the closest alternatives when exact matches are\
&emsp;&emsp;sparse.\
&emsp;**principle** \
&emsp;&emsp;When a user finishes a book, the system look for others who did the same recently\
&emsp;&emsp;Users can accept or decline these matches\
&emsp;&emsp;Accepting a match keeps it active, whiel rejecting a match deactivates it\
&emsp;&emsp;Optionally, the user may ask the system to provde an explanation of a proposed or active match\
&emsp;&emsp;If there aren't many co-finishers of a book at a time, a user may request the "next closest candidates", based on author, sub-genre, temes,\
&emsp;&emsp;or profile overlaps.\
&emsp;&emsp;If AI is unavailable or disabled, matching behavior is unchanged.\
&emsp;**state**\
&emsp;&emsp;a set of Matches with \
&emsp;&emsp;&emsp;a userA User\
&emsp;&emsp;&emsp;a userB User\
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;an active Status\
&emsp;&emsp;&emsp;explanation Text?\
&emsp;&emsp;a set of FinishedBooks with\
&emsp;&emsp;&emsp;a user User\
&emsp;&emsp;&emsp;a book Book\
&emsp;&emsp;&emsp;a finishedAt Date\
&emsp;**actions**\
&emsp;&emsp;generateMatches(owner: User, book: Book): (suggested: set of Matches)\
&emsp;&emsp;&emsp;**requires** owner has a Profile and has finished the book\
&emsp;&emsp;&emsp;**effects** creates a new match with userA = owner, userB = other, book = book, status = pending\
&emsp;&emsp;&emsp;&emsp;this excludes any pairing that already have a match for book. Returns the set of new Matches <br /><br />
&emsp;&emsp;acceptMatch(owner: User, match?: Match)\
&emsp;&emsp;&emsp;**requires** match exixts and owner is either userA or userB and status = pending\
&emsp;&emsp;&emsp;**effects** set active = True<br /><br />
&emsp;&emsp;rejectMatch(owner: User, match: Match)\
&emsp;&emsp;&emsp;**requires** match exists and owner is either userA or userB and status = true\
&emsp;&emsp;&emsp;**effects** set active = false<br /><br />
&emsp;&emsp;explainMatch(requester: User, match: Match): (explanation: Text)\
&emsp;&emsp;&emsp;**requires** match exists and the requestor is either userA or userB and active = true\
&emsp;&emsp;&emsp;**effects** produce a 1-3 sentence reasoning using only public profile fields and the shared book (if applicable) and store in\
&emsp;&emsp;&emsp;match.explanation<br /><br />
&emsp;&emsp;nearbyMatches(owner: User, book: Book): (candidates: set of User)\
&emsp;&emsp;&emsp;**requires** owner has a profile and has finsihed book\
&emsp;&emsp;&emsp;**effects** return a set of suggested users who closely match the interests of owner.