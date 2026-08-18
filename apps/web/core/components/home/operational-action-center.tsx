/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import type { TOperationalIssueSummary } from "@plane/types";
import { cn } from "@plane/utils";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUser } from "@/hooks/store/user";
import { UserService } from "@/services/user.service";

const userService = new UserService();

const COPY = {
  en: {
    title: "Action center",
    description: "The work that needs your attention now.",
    overdue: "Overdue",
    today: "Due today",
    upcoming: "Next 7 days",
    blocked: "Blocked",
    attention: "Needs attention",
    empty: "Nothing urgent. Your immediate queue is clear.",
    retry: "Try again",
    error: "Could not load your action center.",
    create: "New work item",
    noCreateAccess: "You do not have permission to create work items in this workspace.",
    myWork: "View My Work",
    noDate: "No due date",
  },
  ja: {
    title: "アクションセンター",
    description: "今すぐ確認が必要な作業です。",
    overdue: "期限超過",
    today: "本日期限",
    upcoming: "今後7日間",
    blocked: "ブロック中",
    attention: "要対応",
    empty: "緊急対応はありません。直近の作業は整理されています。",
    retry: "再試行",
    error: "アクションセンターを読み込めませんでした。",
    create: "作業項目を作成",
    noCreateAccess: "このワークスペースで作業項目を作成する権限がありません。",
    myWork: "マイワークを見る",
    noDate: "期限なし",
  },
  "zh-CN": {
    title: "行动中心",
    description: "现在最需要你处理的工作。",
    overdue: "已逾期",
    today: "今天到期",
    upcoming: "未来 7 天",
    blocked: "被阻塞",
    attention: "需要处理",
    empty: "目前没有紧急事项，近期队列已清空。",
    retry: "重试",
    error: "行动中心加载失败。",
    create: "新建工作项",
    noCreateAccess: "你没有在此工作区新建工作项的权限。",
    myWork: "查看我的工作",
    noDate: "无截止日期",
  },
} as const;

type TActionKind = "overdue" | "today" | "upcoming" | "blocked";

const CARD_STYLES: Record<TActionKind, string> = {
  overdue: "border-danger-subtle bg-danger-subtle/30 text-danger-primary",
  today: "border-warning-subtle bg-warning-subtle/30 text-warning-primary",
  upcoming: "border-accent-subtle bg-accent-subtle/20 text-accent-primary",
  blocked: "border-danger-subtle bg-surface-1 text-danger-primary",
};

const getIssueLink = (workspaceSlug: string, issue: TOperationalIssueSummary) =>
  `/${workspaceSlug}/projects/${issue.project_id}/issues/${issue.id}`;

export const OperationalActionCenter = observer(function OperationalActionCenter({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { currentLocale } = useTranslation();
  const copy = COPY[currentLocale as keyof typeof COPY] ?? COPY.en;
  const { canPerformAnyCreateAction, data: currentUser } = useUser();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { data, error, isLoading, mutate } = useSWR(
    workspaceSlug ? `MY_OPERATIONAL_DASHBOARD_${workspaceSlug}` : null,
    () => userService.getMyOperationalDashboard(workspaceSlug),
    {
      revalidateOnFocus: false,
      refreshInterval: 60_000,
    }
  );

  const cards = useMemo(
    () => [
      { key: "overdue" as const, label: copy.overdue, issues: data?.overdue_issues ?? [] },
      { key: "today" as const, label: copy.today, issues: data?.today_issues ?? [] },
      { key: "upcoming" as const, label: copy.upcoming, issues: data?.upcoming_issues ?? [] },
      { key: "blocked" as const, label: copy.blocked, issues: data?.blocked_issues ?? [] },
    ],
    [copy, data]
  );

  const attentionItems = useMemo(() => {
    const seen = new Set<string>();
    return cards
      .flatMap((card) => card.issues.map((issue) => ({ issue, kind: card.key, label: card.label })))
      .filter(({ issue }) => {
        if (seen.has(issue.id)) return false;
        seen.add(issue.id);
        return true;
      })
      .slice(0, 6);
  }, [cards]);

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(currentLocale, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`))
      : copy.noDate;

  return (
    <section className="mb-2 rounded-lg border border-subtle bg-surface-1 p-4" aria-labelledby="action-center-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="action-center-title" className="text-16 font-semibold text-primary">
            {copy.title}
          </h2>
          <p className="mt-0.5 text-12 text-secondary">{copy.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {currentUser?.id && (
            <Link
              href={`/${workspaceSlug}/profile/${currentUser.id}`}
              className="rounded-md border border-subtle px-3 py-1.5 text-12 font-medium text-secondary hover:bg-surface-2"
            >
              {copy.myWork}
            </Link>
          )}
          <button
            type="button"
            onClick={() => canPerformAnyCreateAction && toggleCreateIssueModal(true)}
            disabled={!canPerformAnyCreateAction}
            title={!canPerformAnyCreateAction ? copy.noCreateAccess : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-12 font-medium",
              canPerformAnyCreateAction
                ? "bg-accent-primary text-on-color hover:bg-accent-primary/90"
                : "cursor-not-allowed bg-layer-3 text-placeholder"
            )}
          >
            {copy.create}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Loading action center">
          {["overdue", "today", "upcoming", "blocked"].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-md bg-surface-2" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 flex items-center justify-between rounded-md border border-danger-subtle bg-danger-subtle/20 p-3">
          <p className="text-12 text-danger-primary">{copy.error}</p>
          <button type="button" className="text-12 font-medium text-danger-primary underline" onClick={() => mutate()}>
            {copy.retry}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {cards.map((card) => (
              <div key={card.key} className={cn("rounded-md border p-3", CARD_STYLES[card.key])}>
                <div className="text-24 leading-none font-semibold tabular-nums">{card.issues.length}</div>
                <div className="mt-2 text-12 font-medium">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-subtle pt-3">
            <h3 className="text-12 font-semibold text-secondary">{copy.attention}</h3>
            {attentionItems.length === 0 ? (
              <p className="mt-2 rounded-md bg-success-subtle/20 px-3 py-2 text-12 text-secondary">{copy.empty}</p>
            ) : (
              <ul className="mt-1 divide-y divide-subtle">
                {attentionItems.map(({ issue, kind, label }) => (
                  <li key={issue.id}>
                    <Link
                      href={getIssueLink(workspaceSlug, issue)}
                      className="flex items-center gap-3 rounded-sm px-1 py-2.5 hover:bg-surface-2"
                    >
                      <span className={cn("w-16 shrink-0 text-11 font-medium", CARD_STYLES[kind].split(" ").at(-1))}>
                        {label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-13 text-primary">{issue.name}</span>
                      <span className="shrink-0 text-11 text-placeholder">
                        {issue.project__identifier}-{issue.sequence_id}
                      </span>
                      <span className="w-16 shrink-0 text-right text-11 text-secondary">
                        {formatDate(issue.target_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
});
