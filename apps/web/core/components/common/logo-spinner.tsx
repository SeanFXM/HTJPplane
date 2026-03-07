/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// 使用 public 路径以保持 PNG 透明度不被构建处理影响
const LOGO_SPINNER_SRC = "/logo-spinner.png";

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center bg-transparent">
      <span className="inline-block h-11 w-11 animate-spin bg-transparent sm:h-14 sm:w-14">
        <img src={LOGO_SPINNER_SRC} alt="" className="h-full w-full bg-transparent object-contain" aria-hidden />
      </span>
    </div>
  );
}
