/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useRef } from "react";
import { Dialog, Transition } from "@headlessui/react";
// plane imports
import { Button } from "@plane/propel/button";
import type { IInstanceEmployee, TInstanceEmployeeRole } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";

export type TEmployeeAction =
  | {
      type: "role";
      employee: IInstanceEmployee;
      role: TInstanceEmployeeRole;
    }
  | {
      type: "status";
      employee: IInstanceEmployee;
      isActive: boolean;
    };

type TEmployeeActionConfirmModalProps = {
  action: TEmployeeAction | undefined;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function EmployeeActionConfirmModal(props: TEmployeeActionConfirmModalProps) {
  const { action, isSubmitting, onClose, onConfirm } = props;
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  if (!action) return null;

  const employeeName = action.employee.display_name || action.employee.email;
  const isSuspension = action.type === "status" && !action.isActive;

  let title: string;
  let description: string;
  let confirmLabel: string;

  if (action.type === "role") {
    const roleLabel = action.role === EUserWorkspaceRoles.ADMIN ? "Admin" : "Member";
    title = `Change ${employeeName} to ${roleLabel}?`;
    confirmLabel = "Change role";
    description =
      action.role === EUserWorkspaceRoles.ADMIN
        ? "They will be able to manage workspace members and settings in the main app. This does not grant access to the system administration portal."
        : "They will keep normal workspace access but can no longer manage workspace members or settings.";
  } else if (action.isActive) {
    title = `Restore workspace access for ${employeeName}?`;
    confirmLabel = "Restore access";
    description =
      "They will be able to access this workspace again with their existing login. Project access is not restored automatically; a project admin must add them again where needed.";
  } else {
    title = `Suspend workspace access for ${employeeName}?`;
    confirmLabel = "Suspend access";
    description =
      "They can still sign in, but access to this workspace and its projects will be removed. Their existing work data stays in place.";
  }

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Transition.Root show as={Fragment}>
      <Dialog as="div" className="relative z-50" initialFocus={cancelButtonRef} onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-backdrop transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto p-4">
          <div className="flex min-h-full items-center justify-center text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="translate-y-3 opacity-0 sm:translate-y-0 sm:scale-95"
              enterTo="translate-y-0 opacity-100 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="translate-y-0 opacity-100 sm:scale-100"
              leaveTo="translate-y-3 opacity-0 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-raised-200 transition-all">
                <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto px-5 pt-5 pb-4">
                  <Dialog.Title as="h3" className="text-16 leading-6 font-medium text-primary">
                    {title}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 text-13 leading-5 text-tertiary">
                    {description}
                  </Dialog.Description>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-subtle px-5 py-4">
                  <Button
                    ref={cancelButtonRef}
                    variant="secondary"
                    size="lg"
                    disabled={isSubmitting}
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={isSuspension ? "error-fill" : "primary"}
                    size="lg"
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    onClick={onConfirm}
                  >
                    {isSubmitting ? "Saving" : confirmLabel}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
