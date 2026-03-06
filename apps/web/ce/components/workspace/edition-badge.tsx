/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";

/**
 * 白牌化：不展示 Tool/升级 相关入口，完全隐藏
 */
export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  return null;
});
