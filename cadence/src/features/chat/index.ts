// The chat log. P08.
//
// What other features import:
//
//   <MessageBubble message={m} … />     one message, with its day separator and link chip
//   <Composer … />                       the input bar: text, mic, link
//   loadLastThread() / rememberLastThread()
//   the pure helpers in ./model (days, cursors, send validation, search)
//
// There is no edit export and no delete export. A message is what you thought at
// the time; the log is only worth reading because it cannot be tidied afterwards.

export { MessageBubble, DaySeparator, type MessageBubbleProps } from './message-bubble';
export { Composer, type MessageLink, type RestoreText } from './composer';
export { AttachSheet } from './attach-sheet';
export { ThreadBar } from './thread-bar';
export { SearchView } from './search-view';
export { loadLastThread, rememberLastThread } from './last-thread';
export * from './model';

export {
  useThread,
  useThreads,
  useThreadMessages,
  useSendMessage,
  usePendingMessageIds,
  useSearchMessages,
  useLinkedTask,
  registerChatMutationDefaults,
  chatKeys,
  chatMutationKeys,
  type Thread,
  type Message,
  type LinkedTask,
  type SendMessageInput,
} from '@/api/chat';
