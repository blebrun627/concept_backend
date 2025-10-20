&emsp;**concept** Messaging[User, Text]\
&emsp;**purpose** lets reader talk directly in private chats or groups\
&emsp;**principle** \
&emsp;&emsp;Once users connect through matching or browsing profiles, they can stat a private conversation\
&emsp;&emsp;chats store message history until users leave or are blocked\
&emsp;**state**\
&emsp;&emsp;a set of Chats with \
&emsp;&emsp;&emsp;participants set of User\
&emsp;&emsp;&emsp;messages list of Message\
&emsp;&emsp;a set of Message\
&emsp;&emsp;&emsp;an author User\
&emsp;&emsp;&emsp;a body Text\
&emsp;&emsp;a set of Blocks\
&emsp;&emsp;&emsp;blocker User\
&emsp;&emsp;&emsp;blocked User\
&emsp;**actions**\
&emsp;&emsp;startChat(creator: User, participants: set of User): (chat: Chat)\
&emsp;&emsp;&emsp;**requires** at least 2 participants and owner is a participant and there is no blocked pair among any of the participants\
&emsp;&emsp;&emsp;**effects** create a new Chat with participants and an empty messages list. Return the chat<br /><br />
&emsp;&emsp;sendMessage(chat: Chat, author: User, body: Text): (message: Message)\
&emsp;&emsp;&emsp;**requires** chat exists and author is a particpant in the chat\
&emsp;&emsp;&emsp;**effects** append a new message to the chat's message list. Return the new message<br /><br />
&emsp;&emsp;leaveChat(chat: Chat, leaver: User)\
&emsp;&emsp;&emsp;**requires** chat exists and leaver is one of the participants\
&emsp;&emsp;&emsp;**effects** remove leaver from the chat's participants<br /><br />
&emsp;&emsp;blockUser(requester: User, target: User)\
&emsp;&emsp;&emsp;**requires** requester is not the target and a block does not already exist \
&emsp;&emsp;&emsp;**effects** create a new Block with blocker = requester and blocked = target. Remove requester from any chats containing both them and the target\