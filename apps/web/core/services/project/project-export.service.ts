/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IExportServiceResponse, TWorkItemFilterExpression } from "@plane/types";
import { APIService } from "@/services/api.service";
// helpers

export class ProjectExportService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async csvExport(
    workspaceSlug: string,
    data: {
      provider: string;
      project: string[];
      multiple?: boolean;
      rich_filters?: TWorkItemFilterExpression;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/export-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getExportsServicesList(
    workspaceSlug: string,
    cursor: string,
    perPage: number
  ): Promise<IExportServiceResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/export-issues/`, {
      params: {
        per_page: perPage,
        cursor,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
