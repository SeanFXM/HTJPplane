/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type THotoneWorkflowStateDefinition = {
  name: string;
  group: string;
  color: string;
  sequence: number;
};

export type THotoneWorkflowConflict = {
  id: string;
  name: string;
  expected_group: string;
  existing_group: string;
};

export type THotoneWorkflowProjectPreview = {
  project_id: string;
  project_name: string;
  project_identifier: string;
  status: "ready" | "up_to_date" | "blocked";
  existing: Array<{
    id: string;
    name: string;
    group: string;
    default: boolean;
  }>;
  create: THotoneWorkflowStateDefinition[];
  conflicts: THotoneWorkflowConflict[];
  default_action: "preserve" | "set_unorganized";
};

export type THotoneWorkflowPreview = {
  preset_version: string;
  summary: {
    total_projects: number;
    ready_projects: number;
    up_to_date_projects: number;
    blocked_projects: number;
    states_to_create: number;
  };
  projects: THotoneWorkflowProjectPreview[];
};

export type THotoneWorkflowProjectResult = {
  project_id: string;
  project_name: string;
  project_identifier: string;
  status: "applied" | "no_changes" | "blocked";
  created: THotoneWorkflowStateDefinition[];
  conflicts: THotoneWorkflowConflict[];
  default_set: { id: string; name: string } | null;
};

export type THotoneWorkflowApplyResult = {
  preset_version: string;
  summary: {
    total_projects: number;
    applied_projects: number;
    unchanged_projects: number;
    blocked_projects: number;
    states_created: number;
  };
  projects: THotoneWorkflowProjectResult[];
};

export class HotoneWorkflowService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async preview(workspaceSlug: string, projectIds?: string[]): Promise<THotoneWorkflowPreview> {
    return this.post(`/api/workspaces/${workspaceSlug}/hotone-workflow/preview/`, {
      project_ids: projectIds ?? [],
    })
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }

  async apply(workspaceSlug: string, projectIds?: string[]): Promise<THotoneWorkflowApplyResult> {
    return this.post(`/api/workspaces/${workspaceSlug}/hotone-workflow/apply/`, {
      project_ids: projectIds ?? [],
    })
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data ?? error;
      });
  }
}
