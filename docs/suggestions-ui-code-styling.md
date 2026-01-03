# Suggestions UI - Exact Code & Styling

This document contains the complete, exact code and styling for Fleming's suggestions UI components.

## Table of Contents
1. [Component Files](#component-files)
2. [Styling & Motion Configuration](#styling--motion-configuration)
3. [Complete Component Code](#complete-component-code)
4. [CSS Classes Breakdown](#css-classes-breakdown)

---

## Component Files

### File Structure
```
app/components/suggestions/prompt-system.tsx
app/components/chat-input/suggestions.tsx
components/prompt-kit/prompt-suggestion.tsx
lib/motion.ts (TRANSITION_SUGGESTIONS)
components/ui/button.tsx (buttonVariants)
```

---

## Styling & Motion Configuration

### Motion Transition Config (`lib/motion.ts`)

```typescript
export const TRANSITION_SUGGESTIONS = {
  duration: 0.25,
  type: "spring",
  bounce: 0,
}
```

### Button Variants (`components/ui/button.tsx`)

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 dark:border-none",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

---

## Complete Component Code

### 1. PromptSystem Component (`app/components/suggestions/prompt-system.tsx`)

```typescript
"use client"

import { AnimatePresence } from "motion/react"
import React, { memo } from "react"
import { Suggestions } from "../chat-input/suggestions"

type PromptSystemProps = {
  onValueChange: (value: string) => void
  onSuggestion: (suggestion: string) => void
  value: string
}

export const PromptSystem = memo(function PromptSystem({
  onValueChange,
  onSuggestion,
  value,
}: PromptSystemProps) {
  return (
    <>
      <div className="relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]">
        <AnimatePresence mode="popLayout">
          <Suggestions
            onValueChange={onValueChange}
            onSuggestion={onSuggestion}
            value={value}
          />
        </AnimatePresence>
      </div>
    </>
  )
})
```

**Styling Breakdown:**
- Container: `relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]`
  - `relative` - Position relative on mobile
  - `order-1` - Flex order on mobile
  - `w-full` - Full width
  - `md:absolute` - Absolute positioning on desktop (≥768px)
  - `md:bottom-[-70px]` - Positioned 70px below parent on desktop
  - `md:order-2` - Flex order 2 on desktop
  - `md:h-[70px]` - Fixed height of 70px on desktop

---

### 2. Suggestions Component (`app/components/chat-input/suggestions.tsx`)

```typescript
"use client"

import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion"
import { TRANSITION_SUGGESTIONS } from "@/lib/motion"
import { getSuggestionsByRole } from "@/lib/config"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { AnimatePresence, motion } from "motion/react"
import React, { memo, useCallback, useMemo, useState, useEffect } from "react"

type SuggestionsProps = {
  onValueChange: (value: string) => void
  onSuggestion: (suggestion: string) => void
  value?: string
}

const MotionPromptSuggestion = motion.create(PromptSuggestion)

export const Suggestions = memo(function Suggestions({
  onValueChange,
  onSuggestion,
  value,
}: SuggestionsProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const { preferences } = useUserPreferences()

  if (!value && activeCategory !== null) {
    setActiveCategory(null)
  }

  // Get suggestions based on user role and medical specialty
  const SUGGESTIONS_CONFIG = useMemo(() => {
    return getSuggestionsByRole(preferences.userRole, preferences.medicalSpecialty)
  }, [preferences.userRole, preferences.medicalSpecialty])

  const activeCategoryData = SUGGESTIONS_CONFIG.find(
    (group) => group.label === activeCategory
  )

  const showCategorySuggestions =
    activeCategoryData && activeCategoryData.items.length > 0

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setActiveCategory(null)
      onSuggestion(suggestion)
      onValueChange("")
    },
    [onSuggestion, onValueChange]
  )

  const handleCategoryClick = useCallback(
    (suggestion: { label: string; prompt: string }) => {
      setActiveCategory(suggestion.label)
      onValueChange(suggestion.prompt)
    },
    [onValueChange]
  )

  const suggestionsGrid = useMemo(
    () => (
      <motion.div
        key="suggestions-grid"
        className="flex w-full max-w-full flex-nowrap justify-start gap-2 overflow-x-auto px-2 md:mx-auto md:max-w-2xl md:flex-wrap md:justify-center md:pl-0"
        initial="initial"
        animate="animate"
        variants={{
          initial: { opacity: 0, y: 10, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        }}
        transition={TRANSITION_SUGGESTIONS}
        style={{
          scrollbarWidth: "none",
        }}
      >
        {SUGGESTIONS_CONFIG.map((suggestion, index) => (
          <MotionPromptSuggestion
            key={suggestion.label}
            onClick={() => handleCategoryClick(suggestion)}
            className="capitalize"
            initial="initial"
            animate="animate"
            transition={{
              ...TRANSITION_SUGGESTIONS,
              delay: index * 0.02,
            }}
            variants={{
              initial: { opacity: 0, scale: 0.8 },
              animate: { opacity: 1, scale: 1 },
            }}
          >
            <suggestion.icon className="size-4" />
            {suggestion.label}
          </MotionPromptSuggestion>
        ))}
      </motion.div>
    ),
    [handleCategoryClick, SUGGESTIONS_CONFIG]
  )

  const suggestionsList = useMemo(
    () => (
      <motion.div
        className="flex w-full flex-col space-y-1 px-2"
        key={activeCategoryData?.label}
        initial="initial"
        animate="animate"
        variants={{
          initial: { opacity: 0, y: 10, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          exit: {
            opacity: 0,
            y: -10,
            filter: "blur(4px)",
          },
        }}
        transition={TRANSITION_SUGGESTIONS}
      >
        {activeCategoryData?.items.map((suggestion: string, index: number) => (
          <MotionPromptSuggestion
            key={`${activeCategoryData?.label}-${suggestion}-${index}`}
            highlight={activeCategoryData.highlight}
            type="button"
            onClick={() => handleSuggestionClick(suggestion)}
            className="block h-full text-left"
            initial="initial"
            animate="animate"
            variants={{
              initial: { opacity: 0, y: -10 },
              animate: { opacity: 1, y: 0 },
            }}
            transition={{
              ...TRANSITION_SUGGESTIONS,
              delay: index * 0.05,
            }}
          >
            {suggestion}
          </MotionPromptSuggestion>
        ))}
      </motion.div>
    ),
    [
      handleSuggestionClick,
      activeCategoryData?.highlight,
      activeCategoryData?.items,
      activeCategoryData?.label,
    ]
  )

  return (
    <AnimatePresence mode="wait">
      {showCategorySuggestions ? suggestionsList : suggestionsGrid}
    </AnimatePresence>
  )
})
```

**Styling Breakdown:**

#### Suggestions Grid Container:
- `flex` - Flexbox layout
- `w-full` - Full width
- `max-w-full` - Max width 100%
- `flex-nowrap` - No wrapping on mobile
- `justify-start` - Start alignment on mobile
- `gap-2` - 0.5rem (8px) gap between items
- `overflow-x-auto` - Horizontal scroll on mobile
- `px-2` - 0.5rem (8px) horizontal padding on mobile
- `md:mx-auto` - Center horizontally on desktop
- `md:max-w-2xl` - Max width 42rem (672px) on desktop
- `md:flex-wrap` - Allow wrapping on desktop
- `md:justify-center` - Center alignment on desktop
- `md:pl-0` - No left padding on desktop

#### Suggestions List Container:
- `flex` - Flexbox layout
- `w-full` - Full width
- `flex-col` - Column direction
- `space-y-1` - 0.25rem (4px) vertical spacing between items
- `px-2` - 0.5rem (8px) horizontal padding

#### Category Chip (MotionPromptSuggestion in grid):
- `capitalize` - Capitalize first letter of each word
- Icon: `size-4` - 1rem (16px) width and height

#### Suggestion Item (MotionPromptSuggestion in list):
- `block` - Block display
- `h-full` - Full height
- `text-left` - Left-aligned text

**Animation Variants:**

#### Grid Animation:
- Initial: `opacity: 0, y: 10, filter: "blur(4px)"`
- Animate: `opacity: 1, y: 0, filter: "blur(0px)"`
- Chip stagger: `delay: index * 0.02` (20ms per item)
- Chip scale: `initial: { opacity: 0, scale: 0.8 }`, `animate: { opacity: 1, scale: 1 }`

#### List Animation:
- Initial: `opacity: 0, y: 10, filter: "blur(4px)"`
- Animate: `opacity: 1, y: 0, filter: "blur(0px)"`
- Exit: `opacity: 0, y: -10, filter: "blur(4px)"`
- Item stagger: `delay: index * 0.05` (50ms per item)
- Item slide: `initial: { opacity: 0, y: -10 }`, `animate: { opacity: 1, y: 0 }`

---

### 3. PromptSuggestion Component (`components/prompt-kit/prompt-suggestion.tsx`)

```typescript
"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { VariantProps } from "class-variance-authority"

export type PromptSuggestionProps = {
  children: React.ReactNode
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  className?: string
  highlight?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function PromptSuggestion({
  children,
  variant,
  size,
  className,
  highlight,
  ...props
}: PromptSuggestionProps) {
  const isHighlightMode = highlight !== undefined && highlight.trim() !== ""
  const content = typeof children === "string" ? children : ""

  if (!isHighlightMode) {
    return (
      <Button
        variant={variant || "outline"}
        size={size || "lg"}
        className={cn("rounded-full", className)}
        {...props}
      >
        {children}
      </Button>
    )
  }

  if (!content) {
    return (
      <Button
        variant={variant || "ghost"}
        size={size || "sm"}
        className={cn(
          "w-full justify-start rounded-xl py-2",
          "hover:bg-accent",
          className
        )}
        {...props}
      >
        {children}
      </Button>
    )
  }

  const trimmedHighlight = highlight.trim()
  const contentLower = content.toLowerCase()
  const highlightLower = trimmedHighlight.toLowerCase()
  const shouldHighlight = contentLower.includes(highlightLower)

  return (
    <Button
      variant={variant || "ghost"}
      size={size || "sm"}
      className={cn(
        "w-full justify-start gap-0 rounded-xl py-2",
        "hover:bg-accent",
        className
      )}
      {...props}
    >
      {shouldHighlight ? (
        (() => {
          const index = contentLower.indexOf(highlightLower)
          if (index === -1)
            return (
              <span className="text-muted-foreground whitespace-pre-wrap">
                {content}
              </span>
            )

          const actualHighlightedText = content.substring(
            index,
            index + highlightLower.length
          )

          const before = content.substring(0, index)
          const after = content.substring(index + actualHighlightedText.length)

          return (
            <>
              {before && (
                <span className="text-muted-foreground whitespace-pre-wrap">
                  {before}
                </span>
              )}
              <span className="text-primary font-medium whitespace-pre-wrap">
                {actualHighlightedText}
              </span>
              {after && (
                <span className="text-muted-foreground whitespace-pre-wrap">
                  {after}
                </span>
              )}
            </>
          )
        })()
      ) : (
        <span className="text-muted-foreground whitespace-pre-wrap">
          {content}
        </span>
      )}
    </Button>
  )
}

export { PromptSuggestion }
```

**Styling Breakdown:**

#### Category Chip Mode (non-highlight):
- Variant: `outline` (default)
- Size: `lg` (default)
- Base classes: `rounded-full`
- Button base (from `buttonVariants`):
  - `inline-flex items-center justify-center gap-2`
  - `whitespace-nowrap`
  - `text-sm font-medium`
  - `transition-[color,box-shadow]`
  - `h-10 rounded-md px-6` (lg size)
  - `border border-input bg-background shadow-xs` (outline variant)
  - `hover:bg-accent hover:text-accent-foreground`

#### Suggestion Item Mode (highlight mode, no content):
- Variant: `ghost` (default)
- Size: `sm` (default)
- Classes: `w-full justify-start rounded-xl py-2 hover:bg-accent`
- Button base:
  - `h-8 rounded-md gap-1.5 px-3` (sm size)
  - `hover:bg-accent hover:text-accent-foreground` (ghost variant)

#### Suggestion Item Mode (highlight mode, with content):
- Variant: `ghost` (default)
- Size: `sm` (default)
- Classes: `w-full justify-start gap-0 rounded-xl py-2 hover:bg-accent`
- Text styling:
  - Normal text: `text-muted-foreground whitespace-pre-wrap`
  - Highlighted text: `text-primary font-medium whitespace-pre-wrap`

**Complete Class Breakdown:**

#### Category Chip (rounded-full):
```
inline-flex items-center justify-center gap-2 whitespace-nowrap 
rounded-full text-sm font-medium transition-[color,box-shadow] 
h-10 rounded-md px-6 border border-input bg-background shadow-xs 
hover:bg-accent hover:text-accent-foreground
```

#### Suggestion Item (rounded-xl):
```
inline-flex items-center justify-start gap-0 whitespace-nowrap 
rounded-xl text-sm font-medium transition-[color,box-shadow] 
h-8 rounded-md px-3 w-full py-2 hover:bg-accent hover:text-accent-foreground
```

---

## CSS Classes Breakdown

### Layout Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `relative` | `position: relative` | Container positioning |
| `absolute` | `position: absolute` | Desktop positioning |
| `flex` | `display: flex` | Flexbox layout |
| `flex-col` | `flex-direction: column` | Vertical layout |
| `flex-nowrap` | `flex-wrap: nowrap` | Prevent wrapping |
| `flex-wrap` | `flex-wrap: wrap` | Allow wrapping |
| `w-full` | `width: 100%` | Full width |
| `h-full` | `height: 100%` | Full height |
| `h-[70px]` | `height: 70px` | Fixed height |

### Spacing Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `gap-2` | `gap: 0.5rem` (8px) | Gap between items |
| `gap-0` | `gap: 0` | No gap |
| `px-2` | `padding-left/right: 0.5rem` | Horizontal padding |
| `px-3` | `padding-left/right: 0.75rem` | Horizontal padding |
| `px-6` | `padding-left/right: 1.5rem` | Horizontal padding |
| `py-2` | `padding-top/bottom: 0.5rem` | Vertical padding |
| `space-y-1` | `margin-top: 0.25rem` | Vertical spacing |

### Alignment Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `justify-start` | `justify-content: flex-start` | Start alignment |
| `justify-center` | `justify-content: center` | Center alignment |
| `items-center` | `align-items: center` | Center items |
| `text-left` | `text-align: left` | Left text align |
| `mx-auto` | `margin-left/right: auto` | Center horizontally |

### Border & Shape Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `rounded-full` | `border-radius: 9999px` | Fully rounded (pills) |
| `rounded-xl` | `border-radius: 0.75rem` | Extra large radius |
| `rounded-md` | `border-radius: 0.375rem` | Medium radius |
| `border` | `border-width: 1px` | Border width |
| `border-input` | Custom border color | Input border color |

### Typography Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `text-sm` | `font-size: 0.875rem` | Small text |
| `font-medium` | `font-weight: 500` | Medium weight |
| `capitalize` | `text-transform: capitalize` | Capitalize text |
| `whitespace-nowrap` | `white-space: nowrap` | No wrapping |
| `whitespace-pre-wrap` | `white-space: pre-wrap` | Preserve whitespace |
| `text-muted-foreground` | Custom color | Muted text color |
| `text-primary` | Custom color | Primary text color |

### Size Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `size-4` | `width: 1rem; height: 1rem` | Icon size (16px) |
| `h-8` | `height: 2rem` | Small height (32px) |
| `h-9` | `height: 2.25rem` | Default height (36px) |
| `h-10` | `height: 2.5rem` | Large height (40px) |

### Overflow Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `overflow-x-auto` | `overflow-x: auto` | Horizontal scroll |
| `max-w-full` | `max-width: 100%` | Max width constraint |
| `max-w-2xl` | `max-width: 42rem` | Max width (672px) |

### Order Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `order-1` | `order: 1` | Flex order 1 |
| `order-2` | `order: 2` | Flex order 2 |

### Responsive Classes (md: ≥768px)

| Class | Purpose |
|-------|---------|
| `md:absolute` | Absolute positioning on desktop |
| `md:bottom-[-70px]` | Position 70px below on desktop |
| `md:order-2` | Order 2 on desktop |
| `md:h-[70px]` | Fixed height on desktop |
| `md:mx-auto` | Center horizontally on desktop |
| `md:max-w-2xl` | Max width on desktop |
| `md:flex-wrap` | Allow wrapping on desktop |
| `md:justify-center` | Center alignment on desktop |
| `md:pl-0` | No left padding on desktop |

### Interactive Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `hover:bg-accent` | Custom color | Hover background |
| `hover:text-accent-foreground` | Custom color | Hover text color |
| `transition-[color,box-shadow]` | Transition | Smooth transitions |

### Display Classes

| Class | Value | Purpose |
|-------|-------|---------|
| `block` | `display: block` | Block display |

---

## Animation Configuration

### Transition Settings
```typescript
{
  duration: 0.25,  // 250ms
  type: "spring",
  bounce: 0,
}
```

### Animation Variants

#### Grid Container
```typescript
{
  initial: { opacity: 0, y: 10, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" }
}
```

#### Category Chips
```typescript
{
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 }
}
// Stagger delay: index * 0.02 (20ms per item)
```

#### List Container
```typescript
{
  initial: { opacity: 0, y: 10, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(4px)" }
}
```

#### List Items
```typescript
{
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 }
}
// Stagger delay: index * 0.05 (50ms per item)
```

---

## Usage Example

```tsx
import { PromptSystem } from "@/app/components/suggestions/prompt-system"

function ChatInput() {
  const [value, setValue] = useState("")
  
  const handleSuggestion = (suggestion: string) => {
    // Send message with suggestion
    sendMessage(suggestion)
  }
  
  return (
    <div className="relative">
      <input 
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {!value && (
        <PromptSystem
          value={value}
          onValueChange={setValue}
          onSuggestion={handleSuggestion}
        />
      )}
    </div>
  )
}
```

---

## Dependencies

### Required Packages
- `motion/react` - For animations (`AnimatePresence`, `motion`, `motion.create`)
- `@phosphor-icons/react/dist/ssr` - For category icons
- `class-variance-authority` - For button variants
- `@radix-ui/react-slot` - For button composition
- `@/lib/utils` - For `cn()` utility (class merging)

### Required Context/Providers
- `useUserPreferences()` from `@/lib/user-preference-store/provider`
  - Provides: `preferences.userRole`, `preferences.medicalSpecialty`

### Required Config
- `getSuggestionsByRole()` from `@/lib/config`
- `TRANSITION_SUGGESTIONS` from `@/lib/motion`

---

## Complete Styling Reference

### Category Chip (Default State)
```
Button Component (outline variant, lg size)
├── Base: inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium
├── Size: h-10 rounded-md px-6
├── Variant: border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground
└── Custom: rounded-full capitalize
```

### Suggestion Item (List State)
```
Button Component (ghost variant, sm size)
├── Base: inline-flex items-center justify-start gap-0 whitespace-nowrap rounded-md text-sm font-medium
├── Size: h-8 rounded-md px-3
├── Variant: hover:bg-accent hover:text-accent-foreground
├── Custom: w-full justify-start rounded-xl py-2 block h-full text-left
└── Text:
    ├── Normal: text-muted-foreground whitespace-pre-wrap
    └── Highlight: text-primary font-medium whitespace-pre-wrap
```

---

## Notes

1. **Responsive Behavior**: The suggestions UI switches from inline (mobile) to absolutely positioned (desktop) at the `md` breakpoint (768px).

2. **Animation Timing**: 
   - Grid items animate with 20ms stagger
   - List items animate with 50ms stagger
   - All animations use spring physics with 250ms duration

3. **Highlight Logic**: The highlight feature searches for the highlight text (case-insensitive) within the suggestion content and applies `text-primary font-medium` to the matching portion.

4. **State Management**: The component automatically clears the active category when the input value becomes empty.

5. **Icon Sizing**: Category icons use `size-4` (16px × 16px) and are automatically sized via the button's SVG handling.

