/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { observer } from "mobx-react";
import { MapPin } from "lucide-react";
import useSWR from "swr";

import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronLeftIcon, ChevronRightIcon, EditIcon, PlusIcon, TrashIcon } from "@plane/propel/icons";
import type {
  TWorkspaceCalendarEvent,
  TWorkspaceCalendarEventCategory,
  TWorkspaceCalendarEventEditableFields,
} from "@plane/types";
import { cn } from "@plane/utils";
import { useUserPermissions } from "@/hooks/store/user/user-permissions";
import { useUser } from "@/hooks/store/user";
import { WorkspaceService } from "@/services/workspace.service";
import { WorkspaceCalendarEventModal, type TCalendarEventFormCopy } from "./workspace-calendar-event-modal";

const workspaceService = new WorkspaceService();
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const COPY = {
  en: {
    title: "Company calendar",
    description: "Product launches, exhibitions, campaigns, and other dates everyone needs to know.",
    today: "Today",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    add: "Add date",
    retry: "Try again",
    loadError: "Could not load the company calendar.",
    emptyDay: "No company events on this date.",
    upcoming: "Selected date",
    more: (count: number) => `${count} more`,
    eventCount: (count: number) => `${count} events`,
    delete: "Delete event",
    edit: "Edit event",
    deleteConfirm: "Delete this company calendar event?",
    deleteError: "Could not delete this event. Please try again.",
    categoryLabels: {
      product_release: "Product release",
      exhibition: "Exhibition",
      campaign: "Campaign",
      logistics: "Logistics",
      company: "Company",
      other: "Other",
    },
    form: {
      createTitle: "Add company date",
      editTitle: "Edit company date",
      title: "Event name",
      titlePlaceholder: "e.g. Ampero II Stage product launch",
      category: "Category",
      startDate: "Start date",
      endDate: "End date",
      location: "Location",
      locationPlaceholder: "Venue, city, or online",
      description: "Notes",
      descriptionPlaceholder: "Key details the team should know",
      required: "This field is required.",
      invalidRange: "End date cannot be earlier than start date.",
      cancel: "Cancel",
      create: "Add",
      update: "Save",
      saveError: "Could not save this event. Please try again.",
    },
  },
  ja: {
    title: "会社カレンダー",
    description: "製品発売、展示会、キャンペーンなど、全員で共有する重要日程です。",
    today: "今日",
    previousMonth: "前の月",
    nextMonth: "次の月",
    add: "予定を追加",
    retry: "再試行",
    loadError: "会社カレンダーを読み込めませんでした。",
    emptyDay: "この日に会社予定はありません。",
    upcoming: "選択した日",
    more: (count: number) => `ほか ${count} 件`,
    eventCount: (count: number) => `${count} 件の予定`,
    delete: "予定を削除",
    edit: "予定を編集",
    deleteConfirm: "この会社予定を削除しますか？",
    deleteError: "予定を削除できませんでした。もう一度お試しください。",
    categoryLabels: {
      product_release: "製品発売",
      exhibition: "展示会",
      campaign: "キャンペーン",
      logistics: "物流",
      company: "社内予定",
      other: "その他",
    },
    form: {
      createTitle: "会社予定を追加",
      editTitle: "会社予定を編集",
      title: "予定名",
      titlePlaceholder: "例：Ampero II Stage 発売日",
      category: "種類",
      startDate: "開始日",
      endDate: "終了日",
      location: "場所",
      locationPlaceholder: "会場、都市、またはオンライン",
      description: "メモ",
      descriptionPlaceholder: "チームで共有する重要事項",
      required: "必須項目です。",
      invalidRange: "終了日は開始日より前に設定できません。",
      cancel: "キャンセル",
      create: "追加",
      update: "保存",
      saveError: "予定を保存できませんでした。もう一度お試しください。",
    },
  },
  "zh-CN": {
    title: "公司日历",
    description: "全员共享的产品发布、展会、活动与其他关键日期。",
    today: "今天",
    previousMonth: "上个月",
    nextMonth: "下个月",
    add: "添加日期",
    retry: "重试",
    loadError: "公司日历加载失败。",
    emptyDay: "这一天没有公司日程。",
    upcoming: "所选日期",
    more: (count: number) => `另有 ${count} 项`,
    eventCount: (count: number) => `${count} 项日程`,
    delete: "删除日程",
    edit: "编辑日程",
    deleteConfirm: "确定删除这项公司日程吗？",
    deleteError: "日程删除失败，请重试。",
    categoryLabels: {
      product_release: "产品发布",
      exhibition: "展会",
      campaign: "市场活动",
      logistics: "物流节点",
      company: "公司事项",
      other: "其他",
    },
    form: {
      createTitle: "添加公司日程",
      editTitle: "编辑公司日程",
      title: "日程名称",
      titlePlaceholder: "例如：Ampero II Stage 产品发布",
      category: "类型",
      startDate: "开始日期",
      endDate: "结束日期",
      location: "地点",
      locationPlaceholder: "会场、城市或线上",
      description: "备注",
      descriptionPlaceholder: "团队需要知道的关键信息",
      required: "此项为必填项。",
      invalidRange: "结束日期不能早于开始日期。",
      cancel: "取消",
      create: "添加",
      update: "保存",
      saveError: "日程保存失败，请重试。",
    },
  },
  "zh-TW": {
    title: "公司日曆",
    description: "全員共享的產品發布、展會、活動與其他重要日期。",
    today: "今天",
    previousMonth: "上個月",
    nextMonth: "下個月",
    add: "新增日期",
    retry: "重試",
    loadError: "公司日曆載入失敗。",
    emptyDay: "這一天沒有公司行程。",
    upcoming: "所選日期",
    more: (count: number) => `另有 ${count} 項`,
    eventCount: (count: number) => `${count} 項行程`,
    delete: "刪除行程",
    edit: "編輯行程",
    deleteConfirm: "確定刪除這項公司行程嗎？",
    deleteError: "行程刪除失敗，請重試。",
    categoryLabels: {
      product_release: "產品發布",
      exhibition: "展會",
      campaign: "市場活動",
      logistics: "物流節點",
      company: "公司事項",
      other: "其他",
    },
    form: {
      createTitle: "新增公司行程",
      editTitle: "編輯公司行程",
      title: "行程名稱",
      titlePlaceholder: "例如：Ampero II Stage 產品發布",
      category: "類型",
      startDate: "開始日期",
      endDate: "結束日期",
      location: "地點",
      locationPlaceholder: "會場、城市或線上",
      description: "備註",
      descriptionPlaceholder: "團隊需要知道的重要資訊",
      required: "此項為必填項。",
      invalidRange: "結束日期不能早於開始日期。",
      cancel: "取消",
      create: "新增",
      update: "儲存",
      saveError: "行程儲存失敗，請重試。",
    },
  },
} as const;

const CATEGORY_STYLES: Record<TWorkspaceCalendarEventCategory, { chip: string; dot: string; border: string }> = {
  product_release: {
    chip: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    dot: "bg-blue-500",
    border: "border-l-blue-500",
  },
  exhibition: {
    chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
    dot: "bg-orange-500",
    border: "border-l-orange-500",
  },
  campaign: {
    chip: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200",
    dot: "bg-pink-500",
    border: "border-l-pink-500",
  },
  logistics: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    dot: "bg-emerald-500",
    border: "border-l-emerald-500",
  },
  company: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    dot: "bg-violet-500",
    border: "border-l-violet-500",
  },
  other: {
    chip: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-200",
    dot: "bg-gray-400",
    border: "border-l-gray-400",
  },
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateFromKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getMonthGrid = (monthDate: Date) => {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

type TWorkspaceCompanyCalendarProps = {
  workspaceSlug: string;
};

export const WorkspaceCompanyCalendar = observer(function WorkspaceCompanyCalendar(
  props: TWorkspaceCompanyCalendarProps
) {
  const { workspaceSlug } = props;
  const { currentLocale } = useTranslation();
  const copy = COPY[currentLocale as keyof typeof COPY] ?? COPY.en;
  const { allowPermissions } = useUserPermissions();
  const { data: currentUser } = useUser();
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );
  const today = useMemo(() => new Date(), []);
  const [activeMonth, setActiveMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TWorkspaceCalendarEvent | undefined>();
  const [actionError, setActionError] = useState("");
  const [focusDateKey, setFocusDateKey] = useState<string | null>(null);

  const gridDays = useMemo(() => getMonthGrid(activeMonth), [activeMonth]);
  const rangeStart = formatDateKey(gridDays[0]);
  const rangeEnd = formatDateKey(gridDays[gridDays.length - 1]);
  const selectedDateKey = formatDateKey(selectedDate);
  const todayDateKey = formatDateKey(today);

  const {
    data: events = [],
    error,
    isLoading,
    mutate,
  } = useSWR(
    workspaceSlug ? `WORKSPACE_COMPANY_CALENDAR_${workspaceSlug}_${rangeStart}_${rangeEnd}` : null,
    () => workspaceService.fetchWorkspaceCalendarEvents(workspaceSlug, { start: rangeStart, end: rangeEnd }),
    { revalidateOnFocus: false, revalidateOnReconnect: true }
  );

  const weekdayLabels = useMemo(
    () =>
      WEEKDAY_KEYS.map((key, index) => ({
        key,
        label: new Intl.DateTimeFormat(currentLocale, { weekday: "narrow" }).format(new Date(2026, 7, 2 + index)),
      })),
    [currentLocale]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, TWorkspaceCalendarEvent[]>();
    for (const event of events) {
      const eventStart = event.start_date < rangeStart ? rangeStart : event.start_date;
      const rawEnd = event.end_date ?? event.start_date;
      const eventEnd = rawEnd > rangeEnd ? rangeEnd : rawEnd;
      if (eventStart > eventEnd) continue;

      const cursor = dateFromKey(eventStart);
      const end = dateFromKey(eventEnd);
      const dayCount = Math.round((end.getTime() - cursor.getTime()) / 86_400_000);
      for (let dayOffset = 0; dayOffset <= dayCount; dayOffset += 1) {
        const day = new Date(cursor);
        day.setDate(cursor.getDate() + dayOffset);
        const key = formatDateKey(day);
        const dayEvents = map.get(key);
        if (dayEvents) dayEvents.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [events, rangeEnd, rangeStart]);

  const selectedDateEvents = eventsByDate.get(selectedDateKey) ?? [];
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(currentLocale, { year: "numeric", month: "long" }),
    [currentLocale]
  );
  const selectedDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(currentLocale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
    [currentLocale]
  );
  const fullDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(currentLocale, { dateStyle: "full" }),
    [currentLocale]
  );
  const eventRangeFormatter = useMemo(
    () => new Intl.DateTimeFormat(currentLocale, { month: "short", day: "numeric" }),
    [currentLocale]
  );
  const formCopy = useMemo<TCalendarEventFormCopy>(
    () => ({ ...copy.form, categoryLabels: copy.categoryLabels }),
    [copy]
  );

  const monthLabel = monthFormatter.format(activeMonth);
  const selectedDateLabel = selectedDateFormatter.format(selectedDate);

  useEffect(() => {
    if (!focusDateKey) return;
    document.getElementById(`company-calendar-day-${focusDateKey}`)?.focus();
    setFocusDateKey(null);
  }, [focusDateKey]);

  const selectDate = (date: Date, shouldFocus = false) => {
    const nextDate = new Date(date);
    setSelectedDate(nextDate);
    if (nextDate.getFullYear() !== activeMonth.getFullYear() || nextDate.getMonth() !== activeMonth.getMonth()) {
      setActiveMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
    if (shouldFocus) setFocusDateKey(formatDateKey(nextDate));
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: Date) => {
    let dayOffset = 0;

    switch (event.key) {
      case "ArrowLeft":
        dayOffset = -1;
        break;
      case "ArrowRight":
        dayOffset = 1;
        break;
      case "ArrowUp":
        dayOffset = -7;
        break;
      case "ArrowDown":
        dayOffset = 7;
        break;
      case "Home":
        dayOffset = -day.getDay();
        break;
      case "End":
        dayOffset = 6 - day.getDay();
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextDate = new Date(day);
    nextDate.setDate(day.getDate() + dayOffset);
    selectDate(nextDate, true);
  };

  const changeMonth = (offset: number) => {
    const nextMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + offset, 1);
    setActiveMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  const goToToday = () => {
    const now = new Date();
    setActiveMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  const openCreateModal = () => {
    setSelectedEvent(undefined);
    setActionError("");
    setIsModalOpen(true);
  };

  const openEditModal = (event: TWorkspaceCalendarEvent) => {
    setSelectedEvent(event);
    setActionError("");
    setIsModalOpen(true);
  };

  const canManageEvent = (event: TWorkspaceCalendarEvent) =>
    isWorkspaceAdmin || Boolean(currentUser?.id && event.created_by === currentUser.id);

  const handleSubmit = useCallback(
    async (data: TWorkspaceCalendarEventEditableFields, eventId?: string) => {
      if (eventId) await workspaceService.updateWorkspaceCalendarEvent(workspaceSlug, eventId, data);
      else await workspaceService.createWorkspaceCalendarEvent(workspaceSlug, data);
      await mutate();
    },
    [mutate, workspaceSlug]
  );

  const handleDelete = async (eventId: string) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    setActionError("");
    try {
      await workspaceService.deleteWorkspaceCalendarEvent(workspaceSlug, eventId);
      await mutate();
    } catch {
      setActionError(copy.deleteError);
    }
  };

  const getEventRangeLabel = (event: TWorkspaceCalendarEvent) => {
    const start = eventRangeFormatter.format(dateFromKey(event.start_date));
    if (!event.end_date || event.end_date === event.start_date) return start;
    return `${start} – ${eventRangeFormatter.format(dateFromKey(event.end_date))}`;
  };

  return (
    <>
      <WorkspaceCalendarEventModal
        isOpen={isModalOpen}
        event={selectedEvent}
        defaultDate={selectedDateKey}
        copy={formCopy}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <section
        className="mb-6 overflow-hidden rounded-lg border border-subtle bg-surface-1"
        aria-labelledby="company-calendar-title"
      >
        <div className="border-b border-subtle p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 id="company-calendar-title" className="text-16 font-semibold text-primary">
                {copy.title}
              </h2>
              <p className="mt-0.5 text-12 text-secondary">{copy.description}</p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color hover:bg-accent-primary/90 sm:min-h-9 sm:w-auto sm:shrink-0"
              >
                <PlusIcon className="size-4" />
                {copy.add}
              </button>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-2 hover:text-primary sm:size-9"
                aria-label={copy.previousMonth}
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-2 hover:text-primary sm:size-9"
                aria-label={copy.nextMonth}
              >
                <ChevronRightIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={goToToday}
                className="min-h-11 rounded-md px-2.5 text-12 font-medium text-secondary hover:bg-surface-2 hover:text-primary sm:min-h-9"
              >
                {copy.today}
              </button>
            </div>
            <div className="text-15 min-w-0 text-right font-semibold text-primary" aria-live="polite">
              {monthLabel}
            </div>
          </div>
        </div>

        {error ? (
          <div className="grid min-h-56 place-items-center p-6 text-center">
            <div>
              <p className="text-13 text-secondary">{copy.loadError}</p>
              <button
                type="button"
                onClick={() => mutate()}
                className="mt-3 min-h-11 rounded-md border border-subtle px-3 text-13 font-medium text-primary hover:bg-surface-2"
              >
                {copy.retry}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-subtle bg-surface-2/50">
              {weekdayLabels.map(({ key, label }) => (
                <div key={key} className="py-2 text-center text-11 font-medium text-tertiary">
                  {label}
                </div>
              ))}
            </div>

            <div className="bg-subtle-1/50 relative grid grid-cols-7 p-px" aria-busy={isLoading}>
              {gridDays.map((day) => {
                const dayKey = formatDateKey(day);
                const dayEvents = eventsByDate.get(dayKey) ?? [];
                const isCurrentMonth =
                  day.getFullYear() === activeMonth.getFullYear() && day.getMonth() === activeMonth.getMonth();
                const isToday = dayKey === todayDateKey;
                const isSelected = dayKey === selectedDateKey;

                return (
                  <button
                    key={dayKey}
                    id={`company-calendar-day-${dayKey}`}
                    type="button"
                    onClick={() => selectDate(day)}
                    onKeyDown={(event) => handleDayKeyDown(event, day)}
                    tabIndex={isSelected ? 0 : -1}
                    className={cn(
                      "m-px min-h-[68px] min-w-0 overflow-hidden bg-surface-1 p-1 text-left transition-colors hover:bg-surface-2 sm:min-h-[108px] sm:p-1.5",
                      isSelected && "ring-accent-primary ring-2 ring-inset",
                      !isCurrentMonth && "bg-surface-2/40"
                    )}
                    aria-label={`${fullDateFormatter.format(day)}, ${copy.eventCount(dayEvents.length)}`}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full text-12 font-medium",
                        isToday && "bg-accent-primary text-on-color",
                        !isToday && (isCurrentMonth ? "text-primary" : "text-tertiary")
                      )}
                    >
                      {day.getDate()}
                    </span>

                    <span className="mt-1 flex min-w-0 flex-wrap gap-1 px-1 sm:hidden" aria-hidden="true">
                      {dayEvents.slice(0, 4).map((event) => (
                        <span
                          key={event.id}
                          className={cn("size-1.5 rounded-full", CATEGORY_STYLES[event.category].dot)}
                        />
                      ))}
                    </span>

                    <span className="mt-1 hidden min-w-0 space-y-1 sm:block" aria-hidden="true">
                      {dayEvents.slice(0, 2).map((event) => (
                        <span
                          key={event.id}
                          className={cn(
                            "block truncate rounded px-1.5 py-0.5 text-10 font-medium",
                            CATEGORY_STYLES[event.category].chip
                          )}
                        >
                          {event.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="block px-1 text-10 text-tertiary">{copy.more(dayEvents.length - 2)}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {isLoading && <div className="pointer-events-none absolute inset-0 animate-pulse bg-surface-1/40" />}
            </div>

            <div className="border-t border-subtle p-3 sm:p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3" aria-live="polite" aria-atomic="true">
                <div className="min-w-0">
                  <p className="text-11 font-medium tracking-wide text-tertiary uppercase">{copy.upcoming}</p>
                  <h3 className="mt-0.5 truncate text-14 font-semibold text-primary">{selectedDateLabel}</h3>
                </div>
                <span className="shrink-0 text-11 text-tertiary">{copy.eventCount(selectedDateEvents.length)}</span>
              </div>

              {actionError && (
                <p role="alert" className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-12 text-danger-primary">
                  {actionError}
                </p>
              )}

              {selectedDateEvents.length === 0 ? (
                <div className="rounded-md border border-dashed border-subtle px-3 py-5 text-center text-12 text-secondary">
                  {copy.emptyDay}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map((event) => (
                    <article
                      key={event.id}
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-l-4 border-subtle bg-surface-1 p-3",
                        CATEGORY_STYLES[event.category].border
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-10 font-medium",
                              CATEGORY_STYLES[event.category].chip
                            )}
                          >
                            {copy.categoryLabels[event.category]}
                          </span>
                          <span className="text-11 text-tertiary">{getEventRangeLabel(event)}</span>
                        </div>
                        <h4 className="mt-1.5 text-13 font-semibold text-primary">{event.title}</h4>
                        {event.location && (
                          <p className="mt-1 flex items-center gap-1 text-11 text-secondary">
                            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{event.location}</span>
                          </p>
                        )}
                        {event.description && (
                          <p className="mt-1.5 line-clamp-2 text-12 leading-5 whitespace-pre-wrap text-secondary">
                            {event.description}
                          </p>
                        )}
                      </div>

                      {canManageEvent(event) && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(event)}
                            className="grid size-11 place-items-center rounded-md text-tertiary hover:bg-surface-2 hover:text-primary sm:size-8"
                            aria-label={`${copy.edit}: ${event.title}`}
                          >
                            <EditIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(event.id)}
                            className="grid size-11 place-items-center rounded-md text-tertiary hover:bg-danger-subtle hover:text-danger-primary sm:size-8"
                            aria-label={`${copy.delete}: ${event.title}`}
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
});
