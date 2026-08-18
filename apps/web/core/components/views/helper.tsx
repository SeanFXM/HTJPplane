/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { WorkspaceListLayout } from "@/components/issues/issue-layouts/list/roots/workspace-root";

export type TWorkspaceLayoutProps = {
  isLoading?: boolean;
  issuesLoading: boolean;
};

export function WorkspaceActiveLayout(props: TWorkspaceLayoutProps) {
  const { isLoading, issuesLoading } = props;

  return <WorkspaceListLayout isLoading={isLoading} issuesLoading={issuesLoading} />;
}
