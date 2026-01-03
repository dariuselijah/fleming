# Scrolling Behavior in Chat Interface

This document explains exactly how scrolling is handled in the chat interface, particularly for long conversations and during streaming responses.

## Overview

The chat interface uses a sophisticated auto-scrolling system that keeps users focused on the latest messages while allowing them to scroll up to read history. The implementation uses the `use-stick-to-bottom` library combined with custom scroll anchors and CSS variables.

## Core Components

### 1. StickToBottom Component

The main scrolling container is built using the `StickToBottom` component from the `use-stick-to-bottom` library:

```27:36:components/prompt-kit/chat-container.tsx
    <StickToBottom
      className={cn("flex overflow-y-auto", className)}
      resize="smooth"
      initial="instant"
      role="log"
      {...props}
    >
      {children}
    </StickToBottom>
```

**Key properties:**
- `resize="smooth"`: Enables smooth scrolling when content is resized
- `initial="instant"`: Instantly scrolls to bottom on initial load
- `role="log"`: Accessibility attribute indicating this is a chat log

The content wrapper uses `StickToBottom.Content`:

```45:50:components/prompt-kit/chat-container.tsx
    <StickToBottom.Content
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      {children}
    </StickToBottom.Content>
```

### 2. Scroll Button

A floating scroll-to-bottom button appears when the user has scrolled up:

```15:39:components/prompt-kit/scroll-button.tsx
function ScrollButton({
  className,
  variant = "outline",
  size = "sm",
  ...props
}: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "h-10 w-10 rounded-full transition-all duration-150 ease-out",
        !isAtBottom
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-4 scale-95 opacity-0",
        className
      )}
      onClick={() => scrollToBottom()}
      {...props}
    >
      <ChevronDown className="h-5 w-5" />
    </Button>
  )
}
```

**Behavior:**
- Uses `useStickToBottomContext()` to detect if the user is at the bottom
- Shows/hides with smooth transitions when scrolling away from/back to bottom
- Positioned absolutely at the bottom right of the chat container

### 3. Scroll Anchor System

Scroll anchors ensure proper spacing and smooth scrolling, especially for long messages.

#### CSS Variables

The scroll anchor uses CSS variables defined in `globals.css`:

```64:70:app/globals.css
  --spacing-scroll-area: calc(
    -1 * (var(--spacing-input-area) + var(--spacing-app-header))
  );
  --spacing-scroll-anchor-offset: 140px;
  --spacing-scroll-anchor: calc(
    var(--spacing-scroll-area) - var(--spacing-scroll-anchor-offset) + 100dvh
  );
```

#### Scroll Anchor in Messages

Messages can have a `hasScrollAnchor` prop that adds the `min-h-scroll-anchor` class:

```40:44:app/components/chat/conversation.tsx
      const isLast =
        index === uniqueMessages.length - 1 && status !== "submitted"
      const hasScrollAnchor =
        isLast && uniqueMessages.length > initialMessageCount.current
```

**Logic:**
- Only the last message gets a scroll anchor
- Scroll anchor is only added if there are more messages than the initial count
- This prevents scroll anchors on initial load but enables them for new messages

The `min-h-scroll-anchor` class is applied to both user and assistant messages:

```78:79:app/components/chat/message-user.tsx
        "group flex w-full max-w-3xl flex-col items-end gap-0.5 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor",
```

```93:94:app/components/chat/message-assistant.tsx
        "group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor",
```

## Scrolling Behavior During Streaming

### Auto-Scroll During Streaming

The `StickToBottom` component automatically handles scrolling when new content arrives during streaming. The `resize="smooth"` prop ensures that as the streaming message grows, the viewport smoothly scrolls to keep the latest content visible.

### Loading States

During streaming, a loading indicator is shown with scroll anchor spacing:

```90:98:app/components/chat/conversation.tsx
          {/* Show loading immediately when user sends message or when streaming */}
          {(status === "submitted" || status === "streaming" || 
            (hasMessages && messages[messages.length - 1].role === "user" && status === "ready")) &&
            hasMessages &&
            messages[messages.length - 1].role === "user" && (
              <div className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
                <Loader>Processing...</Loader>
              </div>
            )}
```

This loading indicator:
- Appears when status is "submitted" or "streaming"
- Also appears when the last message is from the user (waiting for response)
- Uses `min-h-scroll-anchor` class to maintain proper spacing

### Empty Content During Streaming

When assistant messages are still streaming and have no content yet, a loading indicator is shown:

```117:121:app/components/chat/message-assistant.tsx
        {contentNullOrEmpty ? (
        isLastStreaming ? <div
            className="group min-h-scroll-anchor flex w-full max-w-3xl flex-col items-start gap-2 px-6 pb-2">
              <Loader>Thinking...</Loader>
            </div> : null
```

## Scrolling for Long Chats

### Initial Message Count

The conversation component tracks the initial message count to determine when to enable scroll anchors:

```26:26:app/components/chat/conversation.tsx
  const initialMessageCount = useRef(messages.length)
```

This reference is created once and never updated, allowing the system to distinguish between:
- **Initial messages**: Loaded when the chat opens (no scroll anchor needed)
- **New messages**: Added after initial load (scroll anchor needed for smooth scrolling)

### Scroll Behavior

For long chats with many messages:

1. **Initial Load**: Messages load without scroll anchors, allowing natural scrolling
2. **New Messages**: Only new messages (beyond initial count) get scroll anchors
3. **Auto-Scroll**: The `StickToBottom` component automatically scrolls to bottom when new content is added
4. **User Control**: If user scrolls up, the scroll button appears to return to bottom

### Styling for Long Content

The scroll container uses specific styling to handle long conversations:

```82:87:app/components/chat/conversation.tsx
        <ChatContainerContent
          className="flex w-full flex-col items-center pt-20 pb-4"
          style={{
            scrollbarGutter: "stable both-edges",
            scrollbarWidth: "none",
          }}
```

**Key styles:**
- `scrollbarGutter: "stable both-edges"`: Prevents layout shift when scrollbar appears/disappears
- `scrollbarWidth: "none"`: Hides scrollbar while maintaining scrollability
- `pt-20`: Top padding to account for header
- `pb-4`: Bottom padding for spacing

### Scroll Margin for Headings

Assistant messages include scroll margins for headings to ensure proper spacing when navigating:

```125:126:app/components/chat/message-assistant.tsx
              "prose dark:prose-invert relative min-w-full bg-transparent p-0",
              "prose-h1:scroll-m-20 prose-h1:text-2xl prose-h1:font-semibold prose-h2:mt-8 prose-h2:scroll-m-20 prose-h2:text-xl prose-h2:mb-3 prose-h2:font-medium prose-h3:scroll-m-20 prose-h3:text-base prose-h3:font-medium prose-h4:scroll-m-20 prose-h5:scroll-m-20 prose-h6:scroll-m-20 prose-strong:font-medium prose-table:block prose-table:overflow-y-auto"
```

This ensures that when users scroll to headings (via anchor links or programmatic scrolling), there's proper spacing at the top of the viewport.

## Container Structure

The full scroll container hierarchy:

```
<div className="relative flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto">
  {/* Header mask for mobile */}
  <div className="pointer-events-none absolute top-0 right-0 left-0 z-10...">
    ...
  </div>
  
  <ChatContainerRoot> {/* StickToBottom wrapper */}
    <ChatContainerContent> {/* StickToBottom.Content */}
      {messages}
      {loading indicators}
      <ScrollButton /> {/* Floating scroll button */}
    </ChatContainerContent>
  </ChatContainerRoot>
</div>
```

## Special Cases

### Chat Preview Panel

The chat preview panel in the history sidebar uses a different scrolling mechanism:

```206:216:app/components/history/chat-preview-panel.tsx
  // Immediately scroll to bottom when chatId changes or messages load
  useLayoutEffect(() => {
    if (chatId && messages.length > 0 && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      )
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [chatId, messages.length])
```

This uses a manual scroll-to-bottom approach with `useLayoutEffect` to ensure scrolling happens synchronously when:
- The chatId changes
- Messages are loaded

### Navigation Without Scrolling

When navigating between chats, scrolling is disabled to prevent jarring jumps:

```291:294:app/components/chat/use-chat-core.ts
            setTimeout(() => {
              startTransition(() => {
                router.replace(expectedPath, { scroll: false })
              })
            }, 100)
```

The `scroll: false` option prevents Next.js from scrolling the page when the URL changes.

## Performance Considerations

### Memoization

Messages are memoized to prevent unnecessary re-renders during streaming:

```29:64:app/components/chat/conversation.tsx
  const renderedMessages = useMemo(() => {
    // Handle empty messages
    if (!messages || messages.length === 0) {
      return null
    }
    
    // Filter out duplicate messages by ID to prevent React key conflicts
    const uniqueMessages = messages.filter((message, index, self) => 
      index === self.findIndex(m => m.id === message.id)
    )
    
    return uniqueMessages?.map((message, index) => {
      const isLast =
        index === uniqueMessages.length - 1 && status !== "submitted"
      const hasScrollAnchor =
        isLast && uniqueMessages.length > initialMessageCount.current

      return (
        <Message
          key={message.id}
          id={message.id}
          variant={message.role}
          attachments={message.experimental_attachments}
          isLast={isLast}
          onDelete={onDelete}
          onEdit={onEdit}
          onReload={onReload}
          hasScrollAnchor={hasScrollAnchor}
          parts={message.parts}
          status={status}
        >
          {message.content}
        </Message>
      )
    })
  }, [messages, status, onDelete, onEdit, onReload])
```

This ensures that:
- Only the streaming message re-renders as content arrives
- Other messages remain stable during streaming
- Duplicate messages are filtered out to prevent React key conflicts

### Smooth Resize

The `resize="smooth"` prop on `StickToBottom` ensures that scrolling during streaming is smooth and doesn't cause janky jumps as content grows.

## Summary

The scrolling system provides:

1. **Automatic scrolling** during streaming using `StickToBottom`
2. **Smart scroll anchors** that only apply to new messages (not initial load)
3. **User control** with a floating scroll button when scrolled away from bottom
4. **Performance optimizations** through memoization and smooth resizing
5. **Proper spacing** using CSS variables and scroll margins for headings
6. **Stable layout** with scrollbar gutter to prevent layout shifts

The implementation balances automatic convenience with user control, ensuring a smooth experience whether viewing short or very long conversations.

