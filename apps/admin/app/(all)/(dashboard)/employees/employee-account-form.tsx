/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { CheckCircle2, Eye, EyeOff, RefreshCw } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { CopyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICreateInstanceEmployeePayload, IInstanceEmployee, TInstanceEmployeeRole } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
import { Input } from "@plane/ui";
import { cn, copyTextToClipboard } from "@plane/utils";
// hooks
import { useEmployee } from "@/hooks/store";

type TEmployeeAccountFormProps = {
  workspaceId: string;
  workspaceName: string;
};

type TCreatedCredentials = {
  employee: IInstanceEmployee;
  initialPassword: string;
};

const ROLE_OPTIONS: {
  value: TInstanceEmployeeRole;
  label: string;
  description: string;
}[] = [
  {
    value: EUserWorkspaceRoles.MEMBER,
    label: "Member",
    description: "Can work in projects, tasks, and the company calendar.",
  },
  {
    value: EUserWorkspaceRoles.ADMIN,
    label: "Admin",
    description: "Can manage workspace members and settings in the main app.",
  },
];

const PASSWORD_CHARACTER_GROUPS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"];
const PASSWORD_CHARACTERS = PASSWORD_CHARACTER_GROUPS.join("");

const getRandomIndex = (max: number) => {
  const randomValue = new Uint32Array(1);
  window.crypto.getRandomValues(randomValue);
  return randomValue[0] % max;
};

const getRandomCharacter = (characters: string) => characters[getRandomIndex(characters.length)];

const generateInitialPassword = () => {
  const passwordCharacters = PASSWORD_CHARACTER_GROUPS.map(getRandomCharacter);

  while (passwordCharacters.length < 16) {
    passwordCharacters.push(getRandomCharacter(PASSWORD_CHARACTERS));
  }

  for (let index = passwordCharacters.length - 1; index > 0; index -= 1) {
    const swapIndex = getRandomIndex(index + 1);
    [passwordCharacters[index], passwordCharacters[swapIndex]] = [
      passwordCharacters[swapIndex],
      passwordCharacters[index],
    ];
  }

  return passwordCharacters.join("");
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "The employee account could not be created. Please try again.";

  const errorDetails = error as Record<string, unknown>;
  const knownError = errorDetails.error ?? errorDetails.detail ?? errorDetails.message;
  if (typeof knownError === "string") return knownError;

  for (const value of Object.values(errorDetails)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }

  return "The employee account could not be created. Please try again.";
};

export function EmployeeAccountForm(props: TEmployeeAccountFormProps) {
  const { workspaceId, workspaceName } = props;
  const { createEmployee } = useEmployee();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [createdCredentials, setCreatedCredentials] = useState<TCreatedCredentials | undefined>();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ICreateInstanceEmployeePayload>({
    defaultValues: {
      display_name: "",
      email: "",
      initial_password: "",
      role: EUserWorkspaceRoles.MEMBER,
    },
    mode: "onChange",
  });

  useEffect(() => {
    setValue("initial_password", generateInitialPassword(), { shouldValidate: true });
  }, [setValue]);

  const copyValue = async (label: string, value: string) => {
    try {
      await copyTextToClipboard(value);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `${label} copied`,
        message: `${label} is ready to share with the employee.`,
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Copy failed",
        message: `Could not copy ${label.toLowerCase()}. Please select and copy it manually.`,
      });
    }
  };

  const handleGeneratePassword = () => {
    setValue("initial_password", generateInitialPassword(), { shouldDirty: true, shouldValidate: true });
    setShowPassword(true);
  };

  const onSubmit = async (formData: ICreateInstanceEmployeePayload) => {
    setSubmitError(undefined);
    setCreatedCredentials(undefined);
    const payload: ICreateInstanceEmployeePayload = {
      display_name: formData.display_name.trim(),
      email: formData.email.trim().toLowerCase(),
      initial_password: formData.initial_password,
      role: formData.role,
    };

    try {
      const employee = await createEmployee(workspaceId, payload);
      setCreatedCredentials({ employee, initialPassword: payload.initial_password });
      reset({
        display_name: "",
        email: "",
        initial_password: generateInitialPassword(),
        role: EUserWorkspaceRoles.MEMBER,
      });
      setShowPassword(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  };

  return (
    <section id="new-account" aria-labelledby="new-account-heading" className="scroll-mt-6 border-b border-subtle pb-8">
      <div className="mb-5">
        <h2 id="new-account-heading" className="text-16 font-medium text-primary">
          Add an employee account
        </h2>
        <p className="mt-1 text-13 text-tertiary">
          Create a login-ready account for {workspaceName}. No invitation step is required.
        </p>
      </div>

      {createdCredentials && (
        <div
          className="mb-6 rounded-md border border-success-strong bg-success-subtle p-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-14 font-medium text-success-primary">Account created and ready to sign in</h3>
              <p className="mt-1 text-12 text-secondary">
                Send these details to {createdCredentials.employee.display_name}. The initial password is only shown for
                this account creation.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <CredentialCopyField
                  label="Email"
                  value={createdCredentials.employee.email}
                  onCopy={() => copyValue("Email", createdCredentials.employee.email)}
                />
                <CredentialCopyField
                  label="Initial password"
                  value={createdCredentials.initialPassword}
                  onCopy={() => copyValue("Initial password", createdCredentials.initialPassword)}
                  monospace
                />
              </div>
              <button
                type="button"
                className="mt-3 text-11 font-medium text-success-primary underline-offset-2 hover:underline focus-visible:rounded-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-strong"
                onClick={() =>
                  copyValue(
                    "Login details",
                    `Email: ${createdCredentials.employee.email}\nInitial password: ${createdCredentials.initialPassword}`
                  )
                }
              >
                Copy both login details
              </button>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div
          className="mb-5 rounded-md border border-danger-strong bg-danger-subtle px-3 py-2 text-13 text-danger-primary"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-10">
          <div className="space-y-5">
            <Controller
              control={control}
              name="display_name"
              rules={{
                validate: (value) => value.trim().length > 0 || "Employee name is required.",
              }}
              render={({ field: { value, onChange, onBlur, ref } }) => (
                <FormField
                  label="Employee name"
                  htmlFor="employee-display-name"
                  error={errors.display_name?.message}
                  required
                >
                  <Input
                    id="employee-display-name"
                    name="display_name"
                    type="text"
                    inputSize="md"
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    ref={ref}
                    maxLength={100}
                    autoComplete="name"
                    placeholder="e.g. Yuki Sato"
                    hasError={Boolean(errors.display_name)}
                    aria-invalid={Boolean(errors.display_name)}
                    aria-describedby={errors.display_name ? "employee-display-name-error" : undefined}
                    className="w-full border border-subtle !bg-surface-1 placeholder:text-placeholder"
                  />
                </FormField>
              )}
            />

            <Controller
              control={control}
              name="email"
              rules={{
                required: "Email is required.",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Enter a valid email address.",
                },
              }}
              render={({ field: { value, onChange, onBlur, ref } }) => (
                <FormField label="Email" htmlFor="employee-email" error={errors.email?.message} required>
                  <Input
                    id="employee-email"
                    name="email"
                    type="email"
                    inputSize="md"
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    ref={ref}
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="name@hotone.jp"
                    hasError={Boolean(errors.email)}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "employee-email-error" : undefined}
                    className="w-full border border-subtle !bg-surface-1 placeholder:text-placeholder"
                  />
                </FormField>
              )}
            />

            <Controller
              control={control}
              name="initial_password"
              rules={{
                required: "Initial password is required.",
                minLength: { value: 8, message: "Use at least 8 characters." },
              }}
              render={({ field: { value, onChange, onBlur, ref } }) => (
                <FormField
                  label="Initial password"
                  htmlFor="employee-initial-password"
                  error={errors.initial_password?.message}
                  description="The employee can sign in immediately with this password."
                  required
                >
                  <div className="relative">
                    <Input
                      id="employee-initial-password"
                      name="initial_password"
                      type={showPassword ? "text" : "password"}
                      inputSize="md"
                      value={value}
                      onChange={onChange}
                      onBlur={onBlur}
                      ref={ref}
                      autoComplete="new-password"
                      maxLength={128}
                      placeholder="Generate or enter a password"
                      hasError={Boolean(errors.initial_password)}
                      aria-invalid={Boolean(errors.initial_password)}
                      aria-describedby={errors.initial_password ? "employee-initial-password-error" : undefined}
                      className="font-mono placeholder:font-sans w-full border border-subtle !bg-surface-1 pr-11 placeholder:text-placeholder"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide initial password" : "Show initial password"}
                      className="absolute top-1/2 right-3 -translate-y-1/2 rounded-xs text-placeholder hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-11 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-xs text-accent-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                      onClick={handleGeneratePassword}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Generate a new password
                    </button>
                    <button
                      type="button"
                      disabled={!value}
                      className="inline-flex items-center gap-1.5 rounded-xs text-secondary hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => copyValue("Initial password", getValues("initial_password"))}
                    >
                      <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Copy password
                    </button>
                  </div>
                </FormField>
              )}
            />
          </div>

          <div className="flex flex-col">
            <Controller
              control={control}
              name="role"
              render={({ field: { value, onChange } }) => (
                <fieldset>
                  <legend className="text-13 font-medium text-tertiary">
                    Permission <span className="text-danger-primary">*</span>
                  </legend>
                  <div className="mt-2 space-y-2">
                    {ROLE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        htmlFor={`employee-role-${option.value}`}
                        aria-label={`${option.label}: ${option.description}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
                          value === option.value
                            ? "border-accent-strong bg-accent-primary/5"
                            : "border-subtle bg-surface-1 hover:bg-layer-1-hover"
                        )}
                      >
                        <input
                          id={`employee-role-${option.value}`}
                          type="radio"
                          name="employee-role"
                          value={option.value}
                          checked={value === option.value}
                          onChange={() => onChange(option.value)}
                          className="accent-accent-primary mt-0.5 h-4 w-4 flex-shrink-0"
                        />
                        <span className="min-w-0">
                          <span className="block text-13 font-medium text-primary">{option.label}</span>
                          <span className="mt-0.5 block text-11 leading-4 text-tertiary">{option.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-11 text-tertiary">
                    This is a workspace role. It does not grant access to this system administration portal.
                  </p>
                </fieldset>
              )}
            />

            <div className="mt-6 lg:mt-auto lg:pt-8">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting}
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? "Creating account" : "Create employee account"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

type TFormFieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
};

function FormField(props: TFormFieldProps) {
  const { label, htmlFor, error, description, required = false, children } = props;

  return (
    <div className="space-y-1">
      <label className="text-13 font-medium text-tertiary" htmlFor={htmlFor}>
        {label} {required && <span className="text-danger-primary">*</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-11 text-danger-primary">
          {error}
        </p>
      ) : (
        description && <p className="text-11 text-tertiary">{description}</p>
      )}
    </div>
  );
}

type TCredentialCopyFieldProps = {
  label: string;
  value: string;
  onCopy: () => void;
  monospace?: boolean;
};

function CredentialCopyField(props: TCredentialCopyFieldProps) {
  const { label, value, onCopy, monospace = false } = props;

  return (
    <div>
      <div className="mb-1 text-11 font-medium text-secondary">{label}</div>
      <button
        type="button"
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-success-strong bg-surface-1 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success-strong"
        onClick={onCopy}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <span className={cn("min-w-0 truncate text-12 text-primary", monospace && "font-mono")}>{value}</span>
        <CopyIcon className="h-4 w-4 flex-shrink-0 text-success-primary" aria-hidden="true" />
      </button>
    </div>
  );
}
