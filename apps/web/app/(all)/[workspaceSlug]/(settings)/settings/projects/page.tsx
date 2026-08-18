/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { HotoneWorkflowCard } from "@/components/settings/workspace/hotone-workflow-card";
// local imports
import type { Route } from "./+types/page";
import { WorkspaceProjectsSettingsHeader } from "./header";

function ProjectSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();

  return (
    <SettingsContentWrapper header={<WorkspaceProjectsSettingsHeader />}>
      <PageHead title={t("workspace_settings.settings.projects.workflow.title")} />
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-20 font-semibold text-primary">{t("workspace_settings.settings.projects.heading")}</h1>
          <p className="mt-1 text-13 text-secondary">{t("workspace_settings.settings.projects.description")}</p>
        </div>
        <HotoneWorkflowCard workspaceSlug={workspaceSlug} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(ProjectSettingsPage);
