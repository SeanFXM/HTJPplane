/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Loader, CustomSelect } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { getInternalAdminPageTitle } from "@/constants/branding";
// hooks
import { useEmployee, useWorkspace } from "@/hooks/store";
// local imports
import type { Route } from "./+types/page";
import { EmployeeAccountForm } from "./employee-account-form";
import { EmployeeList } from "./employee-list";

const EmployeeAccountsPage = observer(function EmployeeAccountsPage(_props: Route.ComponentProps) {
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const { fetchEmployees, getEmployeesByWorkspaceId } = useEmployee();
  const { workspaceIds, loader: workspaceLoader, getWorkspaceById, fetchWorkspaces } = useWorkspace();
  const workspaceIdsKey = workspaceIds.join(",");

  useSWR("INSTANCE_WORKSPACES", () => fetchWorkspaces());

  useEffect(() => {
    const availableWorkspaceIds = workspaceIdsKey ? workspaceIdsKey.split(",") : [];

    if (availableWorkspaceIds.length === 1) {
      setSelectedWorkspaceId(availableWorkspaceIds[0]);
      return;
    }

    if (requestedWorkspaceId && availableWorkspaceIds.includes(requestedWorkspaceId)) {
      setSelectedWorkspaceId(requestedWorkspaceId);
      return;
    }

    setSelectedWorkspaceId((currentWorkspaceId) =>
      currentWorkspaceId && availableWorkspaceIds.includes(currentWorkspaceId) ? currentWorkspaceId : ""
    );
  }, [requestedWorkspaceId, workspaceIdsKey]);

  useEffect(() => {
    if (!selectedWorkspaceId || !window.location.hash) return;
    const targetId = window.location.hash.slice(1);
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedWorkspaceId]);

  const selectedWorkspace = selectedWorkspaceId ? getWorkspaceById(selectedWorkspaceId) : undefined;
  const employees = selectedWorkspaceId ? getEmployeesByWorkspaceId(selectedWorkspaceId) : undefined;
  const {
    error: employeeListError,
    isLoading: isEmployeeListLoading,
    mutate: refreshEmployees,
  } = useSWR(
    selectedWorkspaceId ? `INSTANCE_EMPLOYEES_${selectedWorkspaceId}` : null,
    selectedWorkspaceId ? () => fetchEmployees(selectedWorkspaceId) : null
  );

  const isWorkspaceLoading = workspaceLoader === "init-loader";

  return (
    <PageWrapper
      header={{
        title: "Employee accounts",
        description: "Create login-ready Hotone Japan accounts and choose who can manage the workspace.",
      }}
    >
      {isWorkspaceLoading ? (
        <Loader className="space-y-6">
          <Loader.Item height="44px" width="45%" />
          <Loader.Item height="260px" width="100%" />
          <Loader.Item height="120px" width="100%" />
        </Loader>
      ) : workspaceIds.length === 0 ? (
        <div className="rounded-md border border-dashed border-subtle px-4 py-10 text-center">
          <h2 className="text-14 font-medium text-primary">A workspace is required first</h2>
          <p className="mt-1 text-12 text-tertiary">Create or restore the company workspace before adding employees.</p>
        </div>
      ) : (
        <div>
          {workspaceIds.length > 1 ? (
            <div className="mb-7 max-w-md space-y-1">
              <label className="text-13 font-medium text-tertiary" htmlFor="employee-workspace-select">
                Workspace
              </label>
              <CustomSelect
                value={selectedWorkspaceId || null}
                onChange={(workspaceId: string) => setSelectedWorkspaceId(workspaceId)}
                label={
                  selectedWorkspace ? (
                    selectedWorkspace.name
                  ) : (
                    <span className="text-placeholder">Select a workspace</span>
                  )
                }
                buttonClassName="!border-[0.5px] !border-subtle !shadow-none"
                input
              >
                {workspaceIds.map((workspaceId) => {
                  const workspace = getWorkspaceById(workspaceId);
                  if (!workspace) return null;
                  return (
                    <CustomSelect.Option key={workspaceId} value={workspaceId}>
                      {workspace.name}
                    </CustomSelect.Option>
                  );
                })}
              </CustomSelect>
              <p className="text-11 text-tertiary">Employee access is created for the selected workspace.</p>
            </div>
          ) : (
            selectedWorkspace && (
              <div className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-12">
                <span className="text-tertiary">Workspace</span>
                <span className="font-medium text-primary">{selectedWorkspace.name}</span>
              </div>
            )
          )}

          {selectedWorkspace ? (
            <>
              <EmployeeAccountForm
                key={selectedWorkspace.id}
                workspaceId={selectedWorkspace.id}
                workspaceName={selectedWorkspace.name}
              />
              <EmployeeList
                workspaceId={selectedWorkspace.id}
                employees={employees}
                isLoading={isEmployeeListLoading}
                hasError={Boolean(employeeListError)}
                onRetry={() => void refreshEmployees()}
              />
            </>
          ) : (
            <div className="rounded-md border border-dashed border-subtle px-4 py-10 text-center">
              <h2 className="text-14 font-medium text-primary">Select a workspace</h2>
              <p className="mt-1 text-12 text-tertiary">Choose where the employee should be able to work.</p>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: getInternalAdminPageTitle("Employee accounts") }];

export default EmployeeAccountsPage;
