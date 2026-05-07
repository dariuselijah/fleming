"use client"

import { CaretDown, LockKey } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
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

const HOVER_OPEN_DELAY_MS = 90
const HOVER_CLOSE_DELAY_MS = 220

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
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers() {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function scheduleOpen() {
    clearTimers()
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS)
  }

  function scheduleClose() {
    clearTimers()
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
  }

  useEffect(() => () => clearTimers(), [])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
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
        <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-sidebar-foreground/35">
          Navigate
        </p>
        {auth.activePracticeName && (
          <p className="ml-2 max-w-[60%] truncate text-[9px] tracking-wide text-sidebar-foreground/30">
            {auth.activePracticeName}
          </p>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {/* Trigger — only the currently selected item is rendered. */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            clearTimers()
            setOpen((prev) => !prev)
          }}
          onFocus={scheduleOpen}
          className={cn(
            "group relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-lg pl-3 pr-2 text-left",
            "bg-white/[0.05] text-white",
            "transition-colors duration-200",
            open && "bg-white/[0.075]"
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-white"
          />
          <activeItem.icon
            weight="fill"
            className="size-[15px] shrink-0 text-white"
          />
          <span className="flex-1 truncate text-[12px] font-semibold tracking-tight text-white">
            {activeItem.label}
          </span>
          <CaretDown
            weight="bold"
            className={cn(
              "size-3 shrink-0 text-white/45 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
              open && "rotate-180 text-white/80"
            )}
          />
        </button>

        {/* Dropdown — vertical carousel of the remaining items.
         *  Real frosted-glass: heavy backdrop blur + saturation boost,
         *  high-opacity solid fallback so text underneath never bleeds
         *  through (was the previous overlap bug). */}
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.985 }}
              transition={{
                duration: 0.18,
                ease: [0.22, 0.9, 0.32, 1],
              }}
              className={cn(
                "absolute left-0 right-0 top-full z-50 mt-1.5 origin-top",
                "overflow-hidden rounded-xl",
                "border border-white/[0.09]",
                // Near-opaque base — Apple-style "vibrancy" material:
                // mostly solid so text below never bleeds, but the
                // backdrop blur + saturate still gives the refractive
                // glass shimmer on whatever pixels do show through.
                "bg-zinc-950",
                "shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.07)]",
                "supports-[backdrop-filter]:bg-zinc-950/92",
                "supports-[backdrop-filter]:backdrop-blur-2xl",
                "supports-[backdrop-filter]:backdrop-saturate-[180%]"
              )}
              onMouseEnter={clearTimers}
              onMouseLeave={scheduleClose}
            >
              {/* Subtle inner gradient + top-edge highlight for depth. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/[0.04] via-transparent to-black/20"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
              />

              <div className="relative flex flex-col py-1.5">
                {dropdownItems.map((item, index) => {
                  const enabled = auth.hasAnyPermission(item.permissions)
                  const Icon = item.icon
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      disabled={!enabled}
                      title={
                        enabled
                          ? `${item.label} — ${item.description}`
                          : lockLabel(item)
                      }
                      onClick={() => activate(item)}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: index * 0.022,
                        duration: 0.16,
                        ease: [0.22, 0.9, 0.32, 1],
                      }}
                      className={cn(
                        "group/item relative flex h-9 w-full items-center gap-2.5 px-3 text-left",
                        "transition-[background-color,color,transform] duration-150 ease-out",
                        enabled && "text-white/70 hover:bg-white/[0.06] hover:text-white",
                        enabled && "active:scale-[0.985]",
                        !enabled && "cursor-not-allowed text-white/25"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[14.5px] shrink-0 transition-transform duration-150",
                          enabled && "group-hover/item:scale-[1.04]"
                        )}
                        weight="regular"
                      />
                      <span className="flex-1 truncate text-[12px] font-medium tracking-tight">
                        {item.label}
                      </span>
                      {!enabled && (
                        <LockKey className="size-3 shrink-0 text-white/35" />
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
