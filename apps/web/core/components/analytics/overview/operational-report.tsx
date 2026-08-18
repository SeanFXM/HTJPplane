/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import type { TOperationalReportCategory, TOperationalReportIssue, TOperationalReportResponse } from "@plane/types";
import { cn } from "@plane/utils";
import { getPriorityDisplayName } from "@/lib/priority-display";
import { AnalyticsService } from "@/services/analytics.service";

const analyticsService = new AnalyticsService();

const COPY = {
  en: {
    title: "Operations report",
    description: "Actionable risks across the workspace. Select a card to inspect the affected work.",
    retry: "Try again",
    error: "Could not load the operations report.",
    noItems: "No work items in this category.",
    ownerLoad: "In-progress work by owner",
    wipHint: "More than 3 in-progress items may need reprioritization.",
    unassignedOwner: "Unassigned",
    view: "Open work item",
    blockedReason: "Blocked",
    waitingFor: "Waiting for",
    nextAction: "Next",
    waitingSince: "since",
    noOwnerLoad: "No in-progress work is currently assigned.",
    categories: {
      overdue: "Overdue",
      due_soon: "Due in 7 days",
      unassigned: "No owner",
      missing_due_date: "High priority, no due date",
      blocked: "Blocked",
      waiting: "Waiting",
      awaiting_review: "Awaiting confirmation",
      stale: "No update for 30 days",
    },
  },
  ja: {
    title: "業務レポート",
    description: "ワークスペース全体の要対応リスクです。カードを選ぶと対象作業を確認できます。",
    retry: "再試行",
    error: "業務レポートを読み込めませんでした。",
    noItems: "この分類に該当する作業はありません。",
    ownerLoad: "担当者別の進行中作業",
    wipHint: "進行中が3件を超える場合は、優先順位の見直しを推奨します。",
    unassignedOwner: "担当者なし",
    view: "作業項目を開く",
    blockedReason: "ブロック",
    waitingFor: "待ち先",
    nextAction: "次のアクション",
    waitingSince: "待機開始",
    noOwnerLoad: "現在、担当者に割り当てられた進行中作業はありません。",
    categories: {
      overdue: "期限超過",
      due_soon: "7日以内に期限",
      unassigned: "担当者なし",
      missing_due_date: "高優先度・期限なし",
      blocked: "ブロック中",
      waiting: "待機中",
      awaiting_review: "確認待ち",
      stale: "30日間更新なし",
    },
  },
  "zh-CN": {
    title: "运营报告",
    description: "整个工作区中需要采取行动的风险。选择卡片可查看相关工作。",
    retry: "重试",
    error: "运营报告加载失败。",
    noItems: "这个分类中没有工作项。",
    ownerLoad: "各负责人进行中的工作",
    wipHint: "进行中超过 3 项时，建议重新确认优先顺序。",
    unassignedOwner: "未分配",
    view: "打开工作项",
    blockedReason: "阻塞",
    waitingFor: "等待对象",
    nextAction: "下一步",
    waitingSince: "开始等待",
    noOwnerLoad: "当前没有已分配的进行中工作。",
    categories: {
      overdue: "已逾期",
      due_soon: "7 天内到期",
      unassigned: "无负责人",
      missing_due_date: "高优先级但无截止日",
      blocked: "被阻塞",
      waiting: "等待中",
      awaiting_review: "待确认",
      stale: "30 天未更新",
    },
  },
} as const;

const CATEGORY_ORDER: TOperationalReportCategory[] = [
  "overdue",
  "blocked",
  "waiting",
  "awaiting_review",
  "due_soon",
  "unassigned",
  "missing_due_date",
  "stale",
];

const CATEGORY_STYLES: Record<TOperationalReportCategory, string> = {
  overdue: "border-danger-subtle text-danger-primary",
  blocked: "border-danger-subtle text-danger-primary",
  waiting: "border-warning-subtle text-warning-primary",
  awaiting_review: "border-accent-subtle text-accent-primary",
  due_soon: "border-accent-subtle text-accent-primary",
  unassigned: "border-strong text-secondary",
  missing_due_date: "border-warning-subtle text-warning-primary",
  stale: "border-strong text-secondary",
};

const getIssueLink = (workspaceSlug: string, issue: TOperationalReportIssue) =>
  `/${workspaceSlug}/projects/${issue.project_id}/issues/${issue.id}`;

function ReportContent({ workspaceSlug, report }: { workspaceSlug: string; report: TOperationalReportResponse }) {
  const { currentLocale, t } = useTranslation();
  const copy = COPY[currentLocale as keyof typeof COPY] ?? COPY.en;
  const [activeCategory, setActiveCategory] = useState<TOperationalReportCategory>("overdue");
  const activeIssues = report.issues[activeCategory];

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(currentLocale, { year: "numeric", month: "short", day: "numeric" }).format(
          new Date(value.includes("T") ? value : `${value}T00:00:00`)
        )
      : "—";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-20 font-semibold text-primary">{copy.title}</h2>
        <p className="mt-1 text-13 text-secondary">{copy.description}</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {CATEGORY_ORDER.map((category) => {
          const isActive = category === activeCategory;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              aria-pressed={isActive}
              className={cn(
                "focus-visible:ring-accent-primary rounded-lg border bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:outline-none",
                CATEGORY_STYLES[category],
                isActive && "ring-accent-primary ring-2"
              )}
            >
              <div className="text-28 leading-none font-semibold tabular-nums">{report.counts[category]}</div>
              <div className="mt-3 text-12 font-medium text-primary">{copy.categories[category]}</div>
            </button>
          );
        })}
      </div>

      <section aria-labelledby="selected-report-category">
        <h3 id="selected-report-category" className="text-14 font-semibold text-primary">
          {copy.categories[activeCategory]}
        </h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-subtle bg-surface-1">
          {activeIssues.length === 0 ? (
            <p className="px-4 py-8 text-center text-13 text-secondary">{copy.noItems}</p>
          ) : (
            <ul className="divide-y divide-subtle">
              {activeIssues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={getIssueLink(workspaceSlug, issue)}
                    aria-label={`${copy.view}: ${issue.name}`}
                    className="grid grid-cols-[minmax(0,1fr)_150px_120px_100px] items-center gap-4 px-4 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-13 font-medium text-primary">{issue.name}</div>
                      <div className="mt-0.5 truncate text-11 text-placeholder">
                        {issue.project__name} · {issue.project__identifier}-{issue.sequence_id}
                      </div>
                      {(issue.blocked_reason || issue.waiting_party || issue.next_action) && (
                        <div className="mt-1 truncate text-11 text-secondary">
                          {issue.blocked_reason
                            ? `${copy.blockedReason}: ${issue.blocked_reason}`
                            : issue.waiting_party
                              ? `${copy.waitingFor}: ${issue.waiting_party}`
                              : `${copy.nextAction}: ${issue.next_action}`}
                          {issue.waiting_since && ` · ${copy.waitingSince} ${formatDate(issue.waiting_since)}`}
                        </div>
                      )}
                    </div>
                    <span className="truncate text-12 text-secondary">{issue.state__name ?? "—"}</span>
                    <span className="text-12 text-secondary">{formatDate(issue.target_date)}</span>
                    <span className="text-right text-11 font-medium text-secondary">
                      {getPriorityDisplayName(issue.priority, t)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="owner-load-title">
        <div className="flex items-end justify-between gap-4">
          <h3 id="owner-load-title" className="text-14 font-semibold text-primary">
            {copy.ownerLoad}
          </h3>
          <p className="text-11 text-placeholder">{copy.wipHint}</p>
        </div>
        {report.in_progress_by_owner.length === 0 ? (
          <p className="mt-3 rounded-md border border-subtle px-3 py-5 text-center text-12 text-secondary">
            {copy.noOwnerLoad}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {report.in_progress_by_owner.map((owner) => {
              const displayName =
                owner.assignees__display_name ||
                `${owner.assignees__first_name ?? ""} ${owner.assignees__last_name ?? ""}`.trim() ||
                copy.unassignedOwner;
              return (
                <div
                  key={owner.assignees__id}
                  className="flex items-center justify-between rounded-md border border-subtle p-3"
                >
                  <span className="min-w-0 truncate text-12 text-primary">{displayName}</span>
                  <span
                    className={cn(
                      "ml-3 rounded-full px-2 py-0.5 text-11 font-semibold tabular-nums",
                      owner.count > 3 ? "bg-warning-subtle text-warning-primary" : "bg-surface-2 text-secondary"
                    )}
                  >
                    {owner.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function OperationalReport() {
  const { workspaceSlug } = useParams();
  const { currentLocale } = useTranslation();
  const copy = COPY[currentLocale as keyof typeof COPY] ?? COPY.en;
  const slug = workspaceSlug?.toString();
  const { data, error, isLoading, mutate } = useSWR(
    slug ? `OPERATIONAL_REPORT_${slug}` : null,
    () => analyticsService.getOperationalReport(slug as string),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  );

  if (!slug) return null;
  if (isLoading)
    return (
      <div className="space-y-5" aria-label="Loading operations report">
        <div className="h-14 w-80 animate-pulse rounded-md bg-surface-2" />
        <div className="grid grid-cols-4 gap-3">
          {CATEGORY_ORDER.map((category) => (
            <div key={category} className="h-24 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg bg-surface-2" />
      </div>
    );
  if (error || !data)
    return (
      <div className="flex items-center justify-between rounded-lg border border-danger-subtle bg-danger-subtle p-4">
        <p className="text-13 text-danger-primary">{copy.error}</p>
        <button type="button" onClick={() => mutate()} className="text-12 font-medium text-danger-primary underline">
          {copy.retry}
        </button>
      </div>
    );

  return <ReportContent workspaceSlug={slug} report={data} />;
}
