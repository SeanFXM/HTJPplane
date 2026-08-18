/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";

export function AuthHeader() {
  return (
    <div className="sticky top-0 flex w-full flex-shrink-0 items-center justify-between gap-6">
      <Link href="/" className="flex items-center gap-3" aria-label="Hotone Japan Admin home">
        <span className="grid size-8 place-items-center rounded-md bg-accent-primary text-12 font-semibold text-on-color">
          HJ
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-14 font-semibold text-primary">Hotone Japan</span>
          <span className="text-10 font-medium tracking-wide text-tertiary uppercase">Internal Admin</span>
        </span>
      </Link>
    </div>
  );
}
