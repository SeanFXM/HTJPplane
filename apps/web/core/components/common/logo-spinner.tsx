/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import logoSpinnerImg from "@/app/assets/images/logo-spinner.png?url";

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center">
      <span className="inline-block h-11 w-11 animate-spin sm:h-14 sm:w-14">
        <img src={logoSpinnerImg} alt="" className="h-full w-full object-contain" aria-hidden />
      </span>
    </div>
  );
}
