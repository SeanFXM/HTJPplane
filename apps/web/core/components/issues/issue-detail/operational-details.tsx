/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

const COPY = {
  en: {
    title: "Operations",
    description: "Record what is waiting, why work is blocked, and the next concrete action.",
    waitingParty: "Waiting for",
    waitingPlaceholder: "e.g. supplier, customer, internal approval",
    waitingSince: "Waiting since",
    blockedReason: "Blocked reason",
    blockedPlaceholder: "What is preventing progress?",
    nextAction: "Next action",
    nextActionPlaceholder: "What should happen next?",
    save: "Save operations",
    saving: "Saving…",
    saved: "Saved",
    error: "Could not save. Your text is still here; try again.",
    empty: "Not recorded",
  },
  ja: {
    title: "運用情報",
    description: "待ち先、ブロック理由、次に行う作業を明確に記録します。",
    waitingParty: "待ち先",
    waitingPlaceholder: "例：仕入先、顧客、社内承認",
    waitingSince: "待機開始",
    blockedReason: "ブロック理由",
    blockedPlaceholder: "何が進行を妨げていますか？",
    nextAction: "次のアクション",
    nextActionPlaceholder: "次に何をしますか？",
    save: "運用情報を保存",
    saving: "保存中…",
    saved: "保存済み",
    error: "保存できませんでした。入力内容は残っています。再試行してください。",
    empty: "未記録",
  },
  "zh-CN": {
    title: "运营信息",
    description: "记录在等谁、阻塞原因以及下一个具体动作。",
    waitingParty: "等待对象",
    waitingPlaceholder: "例如：供应商、客户、内部审批",
    waitingSince: "开始等待",
    blockedReason: "阻塞原因",
    blockedPlaceholder: "什么在阻止工作推进？",
    nextAction: "下一步动作",
    nextActionPlaceholder: "接下来要做什么？",
    save: "保存运营信息",
    saving: "正在保存…",
    saved: "已保存",
    error: "保存失败。输入内容仍在，请重试。",
    empty: "未记录",
  },
} as const;

type Props = {
  isEditable: boolean;
  issue: TIssue;
  issueId: string;
  projectId: string;
  workspaceSlug: string;
};

type TOperationalForm = Pick<TIssue, "blocked_reason" | "next_action" | "waiting_party">;

const getFormValues = (issue: TIssue): TOperationalForm => ({
  blocked_reason: issue.blocked_reason ?? "",
  next_action: issue.next_action ?? "",
  waiting_party: issue.waiting_party ?? null,
});

const normalizeFormValues = (form: TOperationalForm): TOperationalForm => ({
  blocked_reason: form.blocked_reason.trim(),
  next_action: form.next_action.trim(),
  waiting_party: form.waiting_party?.trim() || null,
});

export const OperationalDetails = observer(function OperationalDetails({
  isEditable,
  issue,
  issueId,
  projectId,
  workspaceSlug,
}: Props) {
  const { currentLocale } = useTranslation();
  const copy = COPY[currentLocale as keyof typeof COPY] ?? COPY.en;
  const { updateIssue } = useIssueDetail();
  const [form, setForm] = useState<TOperationalForm>(() => getFormValues(issue));
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!isDirty) setForm(getFormValues(issue));
  }, [isDirty, issue, issue.blocked_reason, issue.next_action, issue.waiting_party]);

  useEffect(() => {
    setForm(getFormValues(issue));
    setIsDirty(false);
    setSaveState("idle");
    // Reset the editor only when navigating to a different work item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  const normalizedForm = normalizeFormValues(form);
  const currentValues = normalizeFormValues(getFormValues(issue));
  const hasChanges =
    currentValues.waiting_party !== normalizedForm.waiting_party ||
    currentValues.blocked_reason !== normalizedForm.blocked_reason ||
    currentValues.next_action !== normalizedForm.next_action;

  const formatWaitingSince = (value: string | null | undefined) => {
    if (!value) return copy.empty;
    return new Intl.DateTimeFormat(currentLocale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const handleSave = async () => {
    if (!hasChanges || !isEditable || saveState === "saving") return;
    const attemptedValues = normalizedForm;
    setSaveState("saving");
    try {
      await updateIssue(workspaceSlug, projectId, issueId, attemptedValues);
      setForm(attemptedValues);
      setIsDirty(false);
      setSaveState("saved");
    } catch {
      // The issue store rolls back its optimistic update. Restore the user's
      // attempted text locally so retrying never requires retyping it.
      setForm(attemptedValues);
      setIsDirty(true);
      setSaveState("error");
    }
  };

  return (
    <section className="mt-6 border-t border-subtle pt-5" aria-labelledby="issue-operational-details-title">
      <h5 id="issue-operational-details-title" className="text-body-xs-medium text-primary">
        {copy.title}
      </h5>
      <p className="mt-1 text-caption-sm-regular text-secondary">{copy.description}</p>

      <div className={`mt-4 space-y-4 ${!isEditable ? "opacity-60" : ""}`}>
        <label className="block">
          <span className="mb-1.5 block text-caption-sm-medium text-secondary">{copy.waitingParty}</span>
          <Input
            value={form.waiting_party ?? ""}
            onChange={(event) => {
              setForm((current) => ({ ...current, waiting_party: event.target.value }));
              setIsDirty(true);
              setSaveState("idle");
            }}
            placeholder={copy.waitingPlaceholder}
            maxLength={255}
            disabled={!isEditable}
            className="w-full"
          />
        </label>

        <div>
          <span className="block text-caption-sm-medium text-secondary">{copy.waitingSince}</span>
          <span className="mt-1 block text-caption-sm-regular text-placeholder">
            {formatWaitingSince(issue.waiting_since)}
          </span>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-caption-sm-medium text-secondary">{copy.blockedReason}</span>
          <TextArea
            value={form.blocked_reason}
            onChange={(event) => {
              setForm((current) => ({ ...current, blocked_reason: event.target.value }));
              setIsDirty(true);
              setSaveState("idle");
            }}
            placeholder={copy.blockedPlaceholder}
            maxLength={2000}
            disabled={!isEditable}
            textAreaSize="xs"
            className="min-h-16"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-caption-sm-medium text-secondary">{copy.nextAction}</span>
          <TextArea
            value={form.next_action}
            onChange={(event) => {
              setForm((current) => ({ ...current, next_action: event.target.value }));
              setIsDirty(true);
              setSaveState("idle");
            }}
            placeholder={copy.nextActionPlaceholder}
            maxLength={1000}
            disabled={!isEditable}
            textAreaSize="xs"
            className="min-h-16"
          />
        </label>

        {isEditable && (
          <div className="flex items-center justify-between gap-3">
            <span
              role={saveState === "error" ? "alert" : "status"}
              className={`text-caption-sm-regular ${saveState === "error" ? "text-danger-primary" : "text-secondary"}`}
            >
              {saveState === "error" ? copy.error : saveState === "saved" ? copy.saved : ""}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || saveState === "saving"}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-caption-sm-medium text-on-color disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveState === "saving" ? copy.saving : copy.save}
            </button>
          </div>
        )}
      </div>
    </section>
  );
});
