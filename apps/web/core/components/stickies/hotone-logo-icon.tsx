/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const HotoneLogoIcon = ({ className = "size-5" }: { className?: string }) => (
  <span className={`grid place-items-center overflow-hidden rounded-[4px] bg-white ${className}`}>
    <svg viewBox="0 0 64 64" className="size-[80%] text-black" aria-hidden="true">
      <rect x="6" y="6" width="16" height="52" rx="6" fill="currentColor" />
      <rect x="42" y="6" width="16" height="52" rx="6" fill="currentColor" />
      <rect x="18" y="26" width="28" height="12" rx="4" fill="currentColor" />
    </svg>
  </span>
);
