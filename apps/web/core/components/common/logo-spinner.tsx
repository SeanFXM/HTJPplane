/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { HotoneLogoIcon } from "@/components/stickies/hotone-logo-icon";

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center">
      <span className="inline-block h-11 w-11 animate-spin sm:h-14 sm:w-14">
        <HotoneLogoIcon className="h-full w-full" />
      </span>
    </div>
  );
}
