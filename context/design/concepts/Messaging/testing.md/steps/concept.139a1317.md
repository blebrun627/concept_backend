---
timestamp: 'Sun Oct 19 2025 23:44:11 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_234411.fceb7d1a.md]]'
content_id: 139a1317d86d1b5a8ca4b3fe80003eb03892ae0bd0c62147d00fed7f75984eaf
---

# concept: Messaging

* \***concept**: Messaging
* \***purpose**: lets reader talk directly in private chats or groups
* \***principle**: Once users connect through matching or browsing profiles, they can stat a private conversation chats store message history until users leave or are blocked
* \***state**:
  * a set of `Chats` with
    * a set of `participants` of type `User`
    * a set of `messages` of type `Message`
  * a set of `Messages` with
    * an `author` of type `User`
    * a `body` of type `Text`
  * a set of `Blocks` with
    * a `blocker` of type `User`
    * a `blocked` of type `User`
* \***actions**:
  * `startChat(creator: User, participants: set of User): (chat: Chat)`
    * **requires**: at least 2 participants and owner is a participant and there is no blocked pair among any of the participants
    * **effects**: create a new Chat with participants and an empty messages list. Return the chat
  * `sendMessage(chat: Chat, author: User, body: Text): (message: Message)`
    * **requires**: chat exists and author is a particpant in the chat
    * **effects**: append a new message to the chat's message list. Return the new message
  * `leaveChat(chat: Chat, leaver: User)`
    * **requires**: chat exists and leaver is one of the participants
    * **effects**: remove leaver from the chat's participants
  * `blockUser(requester: User, target: User)`
    * **requires**: requester is not the target and a block does not already exist
    * **effects**: create a new Block with blocker = requester and blocked = target. Remove requester from any chats containing both them and the target\\
