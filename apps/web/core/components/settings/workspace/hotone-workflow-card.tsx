/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw, Workflow } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { AlertModalCore } from "@plane/ui";
// services
import {
  HotoneWorkflowService,
  type THotoneWorkflowApplyResult,
  type THotoneWorkflowConflict,
  type THotoneWorkflowPreview,
} from "@/services/hotone-workflow.service";

type Props = {
  workspaceSlug: string;
};

const workflowService = new HotoneWorkflowService();

const STANDARD_STATES = [
  { name: "未整理", color: "#6B7280" },
  { name: "実行待ち", color: "#3B82F6" },
  { name: "進行中", color: "#F59E0B" },
  { name: "待機中", color: "#8B5CF6" },
  { name: "社内確認待ち", color: "#EC4899" },
  { name: "完了", color: "#22C55E" },
  { name: "キャンセル", color: "#94A3B8" },
] as const;

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as { error?: unknown; detail?: unknown; message?: unknown };
    if (typeof candidate.error === "string") return candidate.error;
    if (typeof candidate.detail === "string") return candidate.detail;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return fallback;
}

function ConflictDetails({ conflicts }: { conflicts: THotoneWorkflowConflict[] }) {
  const { t } = useTranslation();

  if (conflicts.length === 0) return null;

  const groupLabels: Record<string, string> = {
    backlog: t("workspace_settings.settings.projects.workflow.groups.backlog"),
    unstarted: t("workspace_settings.settings.projects.workflow.groups.unstarted"),
    started: t("workspace_settings.settings.projects.workflow.groups.started"),
    completed: t("workspace_settings.settings.projects.workflow.groups.completed"),
    cancelled: t("workspace_settings.settings.projects.workflow.groups.cancelled"),
  };

  return (
    <div className="mt-2 rounded-md bg-danger-subtle px-3 py-2 text-11 text-danger-primary">
      {conflicts.map((conflict) => (
        <p key={conflict.id}>
          {t("workspace_settings.settings.projects.workflow.preview.conflict_detail", {
            name: conflict.name,
            existing: groupLabels[conflict.existing_group] ?? conflict.existing_group,
            expected: groupLabels[conflict.expected_group] ?? conflict.expected_group,
          })}
        </p>
      ))}
    </div>
  );
}

export function HotoneWorkflowCard({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<THotoneWorkflowPreview | null>(null);
  const [applyResult, setApplyResult] = useState<THotoneWorkflowApplyResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyProjectIds = useMemo(
    () => preview?.projects.filter((project) => project.status === "ready").map((project) => project.project_id) ?? [],
    [preview]
  );

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);
    setApplyResult(null);
    try {
      setPreview(await workflowService.preview(workspaceSlug));
    } catch (previewError) {
      setError(getErrorMessage(previewError, t("workspace_settings.settings.projects.workflow.errors.generic")));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (readyProjectIds.length === 0) return;
    setIsApplying(true);
    setError(null);
    try {
      const result = await workflowService.apply(workspaceSlug, readyProjectIds);
      setApplyResult(result);
      setIsConfirmOpen(false);
      try {
        setPreview(await workflowService.preview(workspaceSlug));
      } catch {
        // The apply result remains authoritative even if refreshing the preview fails.
      }
    } catch (applyError) {
      setError(getErrorMessage(applyError, t("workspace_settings.settings.projects.workflow.errors.generic")));
      setIsConfirmOpen(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <section className="rounded-xl border border-subtle bg-surface-1">
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-primary/10 text-accent-primary">
                <Workflow className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-16 font-semibold text-primary">
                  {t("workspace_settings.settings.projects.workflow.title")}
                </h2>
                <p className="mt-1 max-w-2xl text-13 leading-5 text-secondary">
                  {t("workspace_settings.settings.projects.workflow.description")}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={handlePreview} loading={isPreviewing} disabled={isApplying}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {preview
                ? t("workspace_settings.settings.projects.workflow.actions.preview_again")
                : t("workspace_settings.settings.projects.workflow.actions.preview")}
            </Button>
          </div>

          <div
            className="flex flex-wrap gap-2"
            aria-label={t("workspace_settings.settings.projects.workflow.states_aria_label")}
          >
            {STANDARD_STATES.map((state) => (
              <span
                key={state.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-2 px-2.5 py-1 text-11 text-secondary"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: state.color }} aria-hidden="true" />
                {state.name}
              </span>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-13 text-danger-primary"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {applyResult && (
            <div className="rounded-md bg-success-subtle px-3 py-2 text-13 text-success-primary">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("workspace_settings.settings.projects.workflow.result.summary", {
                    applied: applyResult.summary.applied_projects,
                    states: applyResult.summary.states_created,
                  })}
                  {applyResult.summary.unchanged_projects > 0 &&
                    ` ${t("workspace_settings.settings.projects.workflow.result.unchanged", {
                      count: applyResult.summary.unchanged_projects,
                    })}`}
                </span>
              </div>
              <ul className="mt-2 space-y-1 border-t border-success-subtle pt-2 pl-6 text-11">
                {applyResult.projects.map((project) => (
                  <li key={project.project_id}>
                    {project.project_name} ({project.project_identifier}):{" "}
                    {project.status === "applied"
                      ? project.default_set
                        ? t("workspace_settings.settings.projects.workflow.result.applied_with_default", {
                            count: project.created.length,
                          })
                        : t("workspace_settings.settings.projects.workflow.result.applied", {
                            count: project.created.length,
                          })
                      : project.status === "no_changes"
                        ? t("workspace_settings.settings.projects.workflow.result.no_changes")
                        : t("workspace_settings.settings.projects.workflow.result.blocked")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview && (
            <div className="overflow-hidden rounded-lg border border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle bg-surface-2 px-4 py-3">
                <p className="text-13 font-medium text-primary">
                  {t("workspace_settings.settings.projects.workflow.preview.title")}
                </p>
                <p className="text-11 text-tertiary">
                  {t("workspace_settings.settings.projects.workflow.preview.summary", {
                    projects: preview.summary.total_projects,
                    states: preview.summary.states_to_create,
                    blocked: preview.summary.blocked_projects,
                  })}
                </p>
              </div>
              {preview.projects.length === 0 ? (
                <p className="px-4 py-6 text-center text-13 text-tertiary">
                  {t("workspace_settings.settings.projects.workflow.preview.no_active_projects")}
                </p>
              ) : (
                <div className="divide-y divide-subtle">
                  {preview.projects.map((project) => (
                    <div key={project.project_id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-13 font-medium text-primary">
                            {project.project_name}{" "}
                            <span className="font-normal text-tertiary">({project.project_identifier})</span>
                          </p>
                          <p className="mt-1 text-11 text-secondary">
                            {project.status === "blocked"
                              ? t("workspace_settings.settings.projects.workflow.preview.conflict_summary")
                              : project.create.length > 0
                                ? t("workspace_settings.settings.projects.workflow.preview.add_states", {
                                    count: project.create.length,
                                  })
                                : project.default_action === "set_unorganized"
                                  ? t("workspace_settings.settings.projects.workflow.preview.set_default", {
                                      state: STANDARD_STATES[0].name,
                                    })
                                  : t("workspace_settings.settings.projects.workflow.preview.configured")}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-11 ${
                            project.status === "blocked"
                              ? "bg-danger-subtle text-danger-primary"
                              : project.status === "up_to_date"
                                ? "bg-success-subtle text-success-primary"
                                : "bg-accent-primary/10 text-accent-primary"
                          }`}
                        >
                          {project.status === "blocked"
                            ? t("workspace_settings.settings.projects.workflow.preview.status.review")
                            : project.status === "up_to_date"
                              ? t("workspace_settings.settings.projects.workflow.preview.status.configured")
                              : t("workspace_settings.settings.projects.workflow.preview.status.ready")}
                        </span>
                      </div>
                      {project.create.length > 0 && project.status !== "blocked" && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {project.create.map((state) => (
                            <span key={state.name} className="rounded bg-surface-2 px-2 py-1 text-11 text-secondary">
                              + {state.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <ConflictDetails conflicts={project.conflicts} />
                    </div>
                  ))}
                </div>
              )}
              {readyProjectIds.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-2 px-4 py-3">
                  <p className="text-11 text-tertiary">
                    {t("workspace_settings.settings.projects.workflow.preview.apply_scope", {
                      count: readyProjectIds.length,
                    })}
                  </p>
                  <Button onClick={() => setIsConfirmOpen(true)} disabled={isPreviewing || isApplying}>
                    {t("workspace_settings.settings.projects.workflow.actions.apply")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <AlertModalCore
        isOpen={isConfirmOpen}
        handleClose={() => !isApplying && setIsConfirmOpen(false)}
        handleSubmit={handleApply}
        isSubmitting={isApplying}
        variant="primary"
        title={t("workspace_settings.settings.projects.workflow.confirm.title")}
        content={t("workspace_settings.settings.projects.workflow.confirm.description", {
          count: readyProjectIds.length,
        })}
        primaryButtonText={{
          loading: t("workspace_settings.settings.projects.workflow.actions.applying"),
          default: t("workspace_settings.settings.projects.workflow.actions.apply_confirm"),
        }}
        secondaryButtonText={t("workspace_settings.settings.projects.workflow.actions.cancel")}
      />
    </>
  );
}
