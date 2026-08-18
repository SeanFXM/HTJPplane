/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, ReactElement, SetStateAction } from "react";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { cn } from "@plane/utils";

interface ResizableSidebarProps {
  showPeek?: boolean;
  togglePeek: (value?: boolean) => void;
  isCollapsed?: boolean;
  width: number;
  setWidth: Dispatch<SetStateAction<number>>;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultCollapsed?: boolean;
  peekDuration?: number;
  toggleCollapsed: (value?: boolean) => void;
  onWidthChange?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  children?: ReactElement;
  extendedSidebar?: ReactElement;
  isAnyExtendedSidebarExpanded?: boolean;
  isAnySidebarDropdownOpen?: boolean;
}

export function ResizableSidebar({
  showPeek = false,
  togglePeek,
  peekDuration = 500,
  isCollapsed = false,
  toggleCollapsed: toggleCollapsedProp,
  onCollapsedChange,
  width,
  setWidth,
  onWidthChange,
  minWidth = 236,
  maxWidth = 350,
  className = "",
  children,
  extendedSidebar,
  isAnyExtendedSidebarExpanded = false,
  isAnySidebarDropdownOpen = false,
}: ResizableSidebarProps) {
  // states
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  // refs
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const initialWidthRef = useRef<number>(0);
  const initialMouseXRef = useRef<number>(0);
  // handlers
  const setShowPeek = useCallback(
    (value: boolean) => {
      togglePeek(value);
    },
    [togglePeek]
  );

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - initialMouseXRef.current;
      const newWidth = Math.min(Math.max(initialWidthRef.current + deltaX, minWidth), maxWidth);
      setWidth(newWidth);
    },
    [isResizing, minWidth, maxWidth, setWidth]
  );

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      initialWidthRef.current = width;
      initialMouseXRef.current = e.clientX;
    },
    [width]
  );

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const toggleCollapsed = useCallback(
    (value?: boolean) => {
      toggleCollapsedProp(value);
      setShowPeek(false);
      setIsHoveringTrigger(false);
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    },
    [toggleCollapsedProp, setShowPeek]
  );

  const handlePeekEnter = useCallback(() => {
    if (isCollapsed && showPeek) {
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    }
  }, [isCollapsed, showPeek]);

  const handlePeekLeave = useCallback(() => {
    if (isCollapsed && !isAnyExtendedSidebarExpanded && !isAnySidebarDropdownOpen) {
      peekTimeoutRef.current = setTimeout(() => {
        setShowPeek(false);
      }, peekDuration);
    }
  }, [isCollapsed, peekDuration, setShowPeek, isAnyExtendedSidebarExpanded, isAnySidebarDropdownOpen]);

  // Set up event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleResize, stopResizing]);

  // Clean up timeout on unmount
  useEffect(
    () => () => {
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAnySidebarDropdownOpen && isCollapsed && isHoveringTrigger) {
      handlePeekLeave();
    }
  }, [handlePeekLeave, isAnySidebarDropdownOpen, isCollapsed, isHoveringTrigger]);

  useEffect(() => {
    if (!isAnyExtendedSidebarExpanded && isCollapsed && isHoveringTrigger) {
      handlePeekLeave();
    }
  }, [handlePeekLeave, isAnyExtendedSidebarExpanded, isCollapsed, isHoveringTrigger]);

  // Reset peek when sidebar is expanded
  useEffect(() => {
    if (!isCollapsed) {
      setShowPeek(false);
      setIsHoveringTrigger(false);
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    }
  }, [isCollapsed, setShowPeek]);

  useEffect(() => {
    if (isCollapsed || isAnyExtendedSidebarExpanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.innerWidth < 768) toggleCollapsed(true);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isAnyExtendedSidebarExpanded, isCollapsed, toggleCollapsed]);

  // Call external handlers when state changes
  useEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);

  useEffect(() => {
    onCollapsedChange?.(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        className={cn(
          "absolute inset-0 z-[19] bg-backdrop transition-opacity md:hidden",
          isCollapsed ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"
        )}
        onClick={() => toggleCollapsed(true)}
        disabled={isCollapsed}
        aria-label="Close main sidebar"
        aria-controls="main-sidebar"
        data-prevent-outside-click
      />

      {/* Main Sidebar */}
      <div
        id="main-sidebar"
        className={cn(
          "absolute inset-y-0 left-0 z-20 h-full max-h-screen shrink-0 border-r border-subtle bg-surface-1 shadow-raised-200 supports-[height:100dvh]:max-h-[100dvh] md:relative md:inset-auto md:shadow-none",
          !isResizing && "transition-all duration-300 ease-in-out",
          isCollapsed
            ? "pointer-events-none invisible w-0 translate-x-[-100%] opacity-0"
            : "visible translate-x-0 opacity-100",
          className
        )}
        style={{
          width: isCollapsed ? 0 : `min(${width}px, calc(100vw - 3rem))`,
          minWidth: isCollapsed ? 0 : `min(${width}px, calc(100vw - 3rem))`,
          maxWidth: isCollapsed ? 0 : `min(${width}px, calc(100vw - 3rem))`,
        }}
        role="complementary"
        aria-label="Main sidebar"
        aria-hidden={isCollapsed}
      >
        <aside
          className={cn(
            "group/sidebar relative flex h-full w-full flex-col overflow-hidden bg-surface-1 pt-3",
            isAnyExtendedSidebarExpanded && "rounded-none"
          )}
        >
          {children}

          {/* Resize Handle */}
          <div
            className={cn(
              "absolute z-[20] hidden h-full w-1 cursor-ew-resize transition-all duration-200 md:block",
              !isResizing && "hover:bg-surface-2",
              isResizing && "w-1.5 bg-layer-1",
              "top-0 right-0"
            )}
            // onDoubleClick toggle sidebar
            onDoubleClick={() => toggleCollapsed()}
            onMouseDown={(e) => startResizing(e)}
            role="separator"
            aria-label="Resize sidebar"
          />
        </aside>
      </div>
      {/* Peek View */}
      <div
        className={cn(
          "shadow-sm absolute left-0 z-20 hidden h-full bg-surface-1 md:block",
          !isResizing && "transition-all duration-300 ease-in-out",
          isCollapsed && showPeek ? "translate-x-0 opacity-100" : "translate-x-[-100%] opacity-0",
          "pointer-events-none",
          isCollapsed && showPeek && "pointer-events-auto",
          !showPeek ? "w-0" : "w-full"
        )}
        style={{
          width: `min(${width}px, calc(100vw - 3rem))`,
        }}
        onMouseEnter={handlePeekEnter}
        onMouseLeave={handlePeekLeave}
        role="complementary"
        aria-label="Sidebar peek view"
      >
        <aside
          className={cn(
            "group/sidebar relative z-20 flex h-full w-full flex-col overflow-hidden bg-surface-1 pt-4",
            "self-center rounded-md rounded-tl-none rounded-bl-none border-r border-subtle",
            isAnyExtendedSidebarExpanded && "rounded-none"
          )}
        >
          {children}
          {/* Resize Handle */}
          <div
            className={cn(
              "absolute z-[20] hidden h-full w-1 cursor-ew-resize transition-all duration-200 md:block",
              !isResizing && "hover:bg-surface-2",
              isResizing && "bg-layer-1",
              "top-0 right-0"
            )}
            // onDoubleClick toggle sidebar
            onDoubleClick={() => toggleCollapsed()}
            onMouseDown={(e) => startResizing(e)}
            role="separator"
            aria-label="Resize sidebar"
          />
        </aside>
      </div>

      {/* Extended Sidebar */}
      {extendedSidebar}
    </>
  );
}
