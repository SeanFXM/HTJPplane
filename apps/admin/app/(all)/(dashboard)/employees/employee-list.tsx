/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IInstanceEmployee, IUpdateInstanceEmployeePayload, TInstanceEmployeeRole } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useEmployee } from "@/hooks/store";
// local imports
import { EmployeeActionConfirmModal } from "./employee-action-confirm-modal";
import type { TEmployeeAction } from "./employee-action-confirm-modal";

type TEmployeeListProps = {
  workspaceId: string;
  employees: IInstanceEmployee[] | undefined;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
};

type TActionError = {
  employeeId: string;
  message: string;
};

const getActionErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "The employee account could not be updated. Please try again.";

  const errorDetails = error as Record<string, unknown>;
  const knownError = errorDetails.error ?? errorDetails.detail ?? errorDetails.message;
  if (typeof knownError === "string") return knownError;

  for (const value of Object.values(errorDetails)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }

  return "The employee account could not be updated. Please try again.";
};

export function EmployeeList(props: TEmployeeListProps) {
  const { workspaceId, employees, isLoading, hasError, onRetry } = props;
  const { updateEmployee } = useEmployee();
  const [pendingAction, setPendingAction] = useState<TEmployeeAction | undefined>();
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<TActionError | undefined>();

  const handleRoleChange = (employee: IInstanceEmployee, roleValue: unknown) => {
    const role = Number(roleValue);
    if (role !== EUserWorkspaceRoles.MEMBER && role !== EUserWorkspaceRoles.ADMIN) return;
    if (role === employee.role) return;

    setActionError(undefined);
    setPendingAction({ type: "role", employee, role: role as TInstanceEmployeeRole });
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;

    setIsUpdating(true);
    setActionError(undefined);
    const payload: IUpdateInstanceEmployeePayload =
      pendingAction.type === "role" ? { role: pendingAction.role } : { is_active: pendingAction.isActive };

    try {
      const updatedEmployee = await updateEmployee(workspaceId, pendingAction.employee.id, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: pendingAction.type === "role" ? "Workspace role updated" : "Workspace access updated",
        message:
          pendingAction.type === "role"
            ? `${updatedEmployee.display_name} is now ${updatedEmployee.role === EUserWorkspaceRoles.ADMIN ? "an Admin" : "a Member"}.`
            : `${updatedEmployee.display_name}'s workspace access was ${updatedEmployee.is_active ? "restored" : "suspended"}.`,
      });
      setPendingAction(undefined);
    } catch (error) {
      const message = getActionErrorMessage(error);
      setActionError({ employeeId: pendingAction.employee.id, message });
      setToast({
        type: TOAST_TYPE.ERROR,
        title: pendingAction.type === "role" ? "Workspace role was not changed" : "Workspace access was not changed",
        message,
      });
      setPendingAction(undefined);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section id="employee-list" aria-labelledby="employee-list-heading" className="scroll-mt-6 pt-8">
      <EmployeeActionConfirmModal
        action={pendingAction}
        isSubmitting={isUpdating}
        onClose={() => setPendingAction(undefined)}
        onConfirm={() => void handleConfirmAction()}
      />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="employee-list-heading"
            className="text-16 font-medium text-primary"
            aria-label={employees ? `Employee accounts, ${employees.length} total` : undefined}
          >
            Employee accounts
            {employees && (
              <span className="ml-2 text-tertiary" aria-hidden="true">
                • {employees.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-13 text-tertiary">Manage workspace roles and suspend or restore workspace access.</p>
        </div>
      </div>

      {isLoading && !employees ? (
        <Loader className="space-y-2">
          <Loader.Item height="62px" width="100%" />
          <Loader.Item height="62px" width="100%" />
          <Loader.Item height="62px" width="100%" />
        </Loader>
      ) : hasError ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-danger-strong bg-danger-subtle px-4 py-3">
          <div>
            <p className="text-13 font-medium text-danger-primary">Employee accounts could not be loaded</p>
            <p className="mt-0.5 text-11 text-secondary">Check the connection and try again.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : employees?.length ? (
        <div className="divide-y divide-subtle rounded-md border border-subtle bg-surface-1" role="list">
          {employees.map((employee) => (
            <div key={employee.id} role="listitem">
              <div className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-layer-2 text-12 font-medium text-secondary uppercase"
                    aria-hidden="true"
                  >
                    {(employee.display_name || employee.email).slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-13 font-medium text-primary">
                      {employee.display_name || "Unnamed employee"}
                    </div>
                    <div className="truncate text-11 text-tertiary">{employee.email}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-12 sm:flex-shrink-0 sm:justify-end sm:pl-0">
                  <CustomSelect
                    value={employee.role}
                    label={employee.role === EUserWorkspaceRoles.ADMIN ? "Admin" : "Member"}
                    onChange={(role: TInstanceEmployeeRole) => handleRoleChange(employee, role)}
                    buttonClassName="!h-7 !min-w-24 !border-[0.5px] !border-subtle !shadow-none"
                    disabled={!employee.is_active || isUpdating}
                    input
                  >
                    <CustomSelect.Option value={EUserWorkspaceRoles.MEMBER}>Member</CustomSelect.Option>
                    <CustomSelect.Option value={EUserWorkspaceRoles.ADMIN}>Admin</CustomSelect.Option>
                  </CustomSelect>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-11 font-medium",
                      employee.is_active ? "bg-success-subtle text-success-primary" : "bg-layer-2 text-placeholder"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        employee.is_active ? "bg-success-primary" : "bg-placeholder"
                      )}
                      aria-hidden="true"
                    />
                    {employee.is_active ? "Active" : "Suspended"}
                  </span>
                  <Button
                    variant={employee.is_active ? "error-outline" : "secondary"}
                    size="lg"
                    disabled={isUpdating}
                    aria-label={`${employee.is_active ? "Suspend workspace access for" : "Restore workspace access for"} ${employee.display_name || employee.email}`}
                    onClick={() => {
                      setActionError(undefined);
                      setPendingAction({ type: "status", employee, isActive: !employee.is_active });
                    }}
                  >
                    {employee.is_active ? "Suspend access" : "Restore access"}
                  </Button>
                </div>
              </div>
              {actionError?.employeeId === employee.id && (
                <div
                  className="border-t border-danger-strong bg-danger-subtle px-4 py-2 text-12 text-danger-primary"
                  role="alert"
                >
                  {actionError.message}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-subtle px-4 py-8 text-center">
          <p className="text-13 font-medium text-primary">No employee accounts yet</p>
          <p className="mt-1 text-11 text-tertiary">Use the form above to create the first login-ready account.</p>
        </div>
      )}
    </section>
  );
}
