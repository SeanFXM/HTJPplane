/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
import { Box, PenTool, Rocket, Monitor, RefreshCw } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CheckIcon, ViewsIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TUserProfile } from "@plane/types";
import { EOnboardingSteps } from "@plane/types";
// hooks
import { useUserProfile } from "@/hooks/store/user";
// local components
import { CommonOnboardingHeader } from "../common";
import type { TProfileSetupFormValues } from "../profile/root";

type Props = {
  handleStepChange: (step: EOnboardingSteps, skipInvites?: boolean) => void;
};

const ROLES = [
  { id: "product-manager", labelKey: "onboarding_roles.product_manager", icon: Box },
  { id: "engineering-manager", labelKey: "onboarding_roles.engineering_manager", icon: ViewsIcon },
  { id: "designer", labelKey: "onboarding_roles.designer", icon: PenTool },
  { id: "developer", labelKey: "onboarding_roles.developer", icon: Monitor },
  { id: "founder-executive", labelKey: "onboarding_roles.founder_executive", icon: Rocket },
  { id: "operations-manager", labelKey: "onboarding_roles.operations_manager", icon: RefreshCw },
  { id: "others", labelKey: "onboarding_roles.others", icon: Box },
];

const defaultValues = {
  role: "",
};

export const RoleSetupStep = observer(function RoleSetupStep({ handleStepChange }: Props) {
  const { t } = useTranslation();
  // store hooks
  const { data: profile, updateUserProfile } = useUserProfile();
  // form info
  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isValid },
  } = useForm<TProfileSetupFormValues>({
    defaultValues: {
      ...defaultValues,
      role: profile?.role,
    },
    mode: "onChange",
  });

  // handle submit
  const handleSubmitUserPersonalization = async (formData: TProfileSetupFormValues) => {
    const profileUpdatePayload: Partial<TUserProfile> = {
      role: formData.role,
    };
    try {
      await updateUserProfile(profileUpdatePayload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success_exclamation"),
        message: t("profile_setup_completed"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error_exclamation"),
        message: t("profile_setup_failed"),
      });
    }
  };

  const onSubmit = async (formData: TProfileSetupFormValues) => {
    if (!profile) return;
    await handleSubmitUserPersonalization(formData);
    handleStepChange(EOnboardingSteps.ROLE_SETUP);
  };

  const handleSkip = () => {
    handleStepChange(EOnboardingSteps.ROLE_SETUP);
  };

  const isButtonDisabled = !(!isSubmitting && isValid);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-10">
      {/* Header */}
      <CommonOnboardingHeader title="What's your role?" description="Let's set things up for how you work." />
      {/* Role Selection */}
      <div className="flex flex-col gap-3">
        <p className="text-body-sm-semibold text-placeholder">Select one</p>
        <Controller
          control={control}
          name="role"
          rules={{
            required: t("this_field_is_required"),
          }}
          render={({ field: { value, onChange } }) => (
            <div className="flex flex-col gap-3">
              {ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = value === role.id;

                return (
                  <button
                    key={role.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onChange(role.id);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition-all duration-200 ${
                      isSelected
                        ? "border-accent-strong bg-accent-subtle text-accent-primary"
                        : "border-subtle text-tertiary hover:border-strong"
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="size-3.5" />
                      <span className="text-body-sm-semibold">{t(role.labelKey)}</span>
                    </div>
                    {isSelected && (
                      <>
                        <button
                          className={`border-blue-500 flex size-4 items-center justify-center rounded-sm border-2 bg-accent-primary`}
                        >
                          <CheckIcon className="h-3 w-3 text-on-color" />
                        </button>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        />
        {errors.role && <span className="text-13 text-danger-primary">{errors.role.message}</span>}
      </div>
      {/* Action Buttons */}
      <div className="space-y-3">
        <Button variant="primary" type="submit" className="w-full" size="xl" disabled={isButtonDisabled}>
          Continue
        </Button>
        <Button variant="ghost" onClick={handleSkip} className="w-full text-tertiary" size="xl">
          Skip
        </Button>
      </div>
    </form>
  );
});
