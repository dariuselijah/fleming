"use client"

import { CaretDown, LockKey } from "@phosphor-icons/react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAppSettingsDialog } from "@/lib/app-settings-dialog-store"
import { useAuthContext } from "@/lib/auth/provider"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { MASTER_NAV_ITEMS, type MasterNavItem } from "./nav-model"

function lockLabel(item: MasterNavItem) {
  if (item.permissions.includes("settings:practice")) return "Owner / admin only"
  if (item.permissions.includes("clinical:access")) return "Clinical access required"
  if (item.permissions.includes("billing:access")) return "Billing access required"
  if (item.permissions.includes("inventory:access")) return "Inventory access required"
  if (item.permissions.includes("analytics:access")) return "Analytics access required"
  if (item.permissions.includes("channels:access")) return "Channels access required"
  return "Restricted"
}

export function MasterSidebarNav() {
  const auth = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()
  const openSettings = useAppSettingsDialog((s) => s.openSettings)
  const mode = useWorkspaceStore((s) => s.mode)
  const activeAdminTab = useWorkspaceStore((s) => s.activeAdminTab)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const pendingFocusRef = useRef<"first" | "last" | null>(null)

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  // Auto-close when route changes (after the user picks something).
  useEffect(() => {
    setOpen(false)
  }, [pathname, mode, activeAdminTab])

  const activeItemId = useMemo(() => {
    const routeMatch = MASTER_NAV_ITEMS.find(
      (item) => item.href && item.href !== "/" && pathname === item.href
    )
    if (routeMatch) return routeMatch.id

    if (mode === "chat") return "chat"

    if (mode === "admin") {
      return (
        MASTER_NAV_ITEMS.find((item) => item.adminTab === activeAdminTab)?.id ??
        null
      )
    }

    if (mode === "clinical") return "clinical"
    if (pathname === "/") return "chat"
    return null
  }, [pathname, mode, activeAdminTab])

  const activeItem =
    MASTER_NAV_ITEMS.find((item) => item.id === activeItemId) ??
    MASTER_NAV_ITEMS[0]
  const dropdownItems = MASTER_NAV_ITEMS.filter(
    (item) => item.id !== activeItem.id
  )

  useEffect(() => {
    if (!open || !pendingFocusRef.current) return
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => !!item && !item.disabled
    )
    const target =
      pendingFocusRef.current === "last"
        ? enabledItems.at(-1)
        : enabledItems.at(0)
    pendingFocusRef.current = null
    target?.focus()
  }, [open])

  function openMenu(focus: "first" | "last") {
    pendingFocusRef.current = focus
    setOpen(true)
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      openMenu("first")
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      openMenu("last")
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => !!item && !item.disabled
    )
    if (enabledItems.length === 0) return

    const currentIndex = enabledItems.findIndex(
      (item) => item === document.activeElement
    )
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const direction = event.key === "ArrowDown" ? 1 : -1
      const nextIndex =
        (Math.max(currentIndex, 0) + direction + enabledItems.length) %
        enabledItems.length
      enabledItems[nextIndex]?.focus()
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const target =
        event.key === "Home" ? enabledItems.at(0) : enabledItems.at(-1)
      target?.focus()
    } else if (event.key === "Tab") {
      setOpen(false)
    }
  }

  function activate(item: MasterNavItem) {
    if (!auth.hasAnyPermission(item.permissions)) return
    if (item.settings) {
      openSettings()
      setOpen(false)
      return
    }
    if (item.mode) setMode(item.mode)
    if (item.adminTab) setAdminTab(item.adminTab)
    if (item.href) router.push(item.href)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between px-2">
        <p className="text-micro font-medium uppercase tracking-[0.18em] text-sidebar-foreground/45">
          Navigate
        </p>
        {auth.activePracticeName && (
          <p className="text-micro ml-2 max-w-[60%] truncate tracking-wide text-sidebar-foreground/45">
            {auth.activePracticeName}
          </p>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative"
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="master-navigation-menu"
          onClick={(event) => {
            if (open) {
              setOpen(false)
              return
            }
            if (event.detail === 0) pendingFocusRef.current = "first"
            setOpen(true)
          }}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "group relative flex min-h-touch w-full items-center gap-2.5 overflow-hidden rounded-lg pl-3 pr-2 text-left",
            "bg-sidebar-accent text-sidebar-foreground",
            "transition-colors duration-[var(--duration-fast)] ease-calm",
            open && "bg-sidebar-accent"
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-sidebar-primary"
          />
          <activeItem.icon
            weight="fill"
            className="size-[15px] shrink-0 text-sidebar-foreground"
          />
          <span className="flex-1 truncate text-[12px] font-semibold tracking-tight text-sidebar-foreground">
            {activeItem.label}
          </span>
          <CaretDown
            weight="bold"
            className={cn(
              "size-3 shrink-0 text-sidebar-foreground/65 transition-transform duration-[var(--duration-fast)] ease-calm",
              open && "rotate-180 text-sidebar-foreground/80"
            )}
          />
        </button>

        {open && (
            <div
              id="master-navigation-menu"
              role="menu"
              aria-label="Workspace navigation"
              onKeyDown={handleMenuKeyDown}
              className={cn(
                "absolute left-0 right-0 top-full z-[var(--z-popover)] mt-1.5 origin-top",
                "overflow-hidden rounded-xl",
                "border border-sidebar-border",
                "bg-popover",
                "shadow-floating",
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-[var(--duration-fast)]"
              )}
            >
              <div className="flex flex-col py-1.5">
                {dropdownItems.map((item, index) => {
                  const enabled = auth.hasAnyPermission(item.permissions)
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      ref={(element) => {
                        itemRefs.current[index] = element
                      }}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      disabled={!enabled}
                      title={
                        enabled
                          ? `${item.label} — ${item.description}`
                          : lockLabel(item)
                      }
                      onClick={() => activate(item)}
                      className={cn(
                        "group/item relative flex min-h-touch w-full items-center gap-2.5 px-3 text-left",
                        "transition-colors duration-[var(--duration-fast)] ease-calm",
                        enabled && "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        !enabled && "cursor-not-allowed text-sidebar-foreground/45"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[14.5px] shrink-0"
                        )}
                        weight="regular"
                      />
                      <span className="flex-1 truncate text-[12px] font-medium tracking-tight">
                        {item.label}
                      </span>
                      {!enabled && (
                        <LockKey className="size-3 shrink-0 text-sidebar-foreground/45" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
