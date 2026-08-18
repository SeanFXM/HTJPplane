/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLanguage } from "@plane/i18n";
import type { TPage } from "@plane/types";

export type TPageTemplateId = "blank" | "project-brief" | "meeting-notes" | "retrospective";

export type TPageTemplate = {
  id: TPageTemplateId;
  emoji: string;
  name: string;
  summary: string;
  pageTitle: string;
  descriptionHtml: string;
};

type TTemplateLocale = "en" | "ja" | "zh-CN";

type TPageTemplateCopy = {
  heading: string;
  description: string;
  creating: string;
  templates: Record<TPageTemplateId, Omit<TPageTemplate, "id">>;
};

const TEMPLATE_COPY: Record<TTemplateLocale, (date: string) => TPageTemplateCopy> = {
  en: (date) => ({
    heading: "Hotone internal templates",
    description: "Start with the structure the team uses most often. You can edit every field after creation.",
    creating: "Creating…",
    templates: {
      blank: {
        emoji: "📄",
        name: "Blank page",
        summary: "Start with a clean page and an editable title.",
        pageTitle: "Untitled page",
        descriptionHtml: "<p></p>",
      },
      "project-brief": {
        emoji: "📋",
        name: "Project brief",
        summary: "Align the owner, goal, scope, deliverables, and next actions.",
        pageTitle: "Project brief — [Project / product name]",
        descriptionHtml: [
          "<p><strong>Owner / DRI:</strong> [Name]</p>",
          "<p><strong>Target date:</strong> [YYYY-MM-DD]</p>",
          "<h2>Goal</h2>",
          "<p>[What outcome are we trying to achieve, and why now?]</p>",
          "<h2>Background</h2>",
          "<p>[Customer, product, campaign, or operational context]</p>",
          "<h2>Scope</h2>",
          "<ul><li><strong>In:</strong> [What this project includes]</li><li><strong>Out:</strong> [What this project does not include]</li></ul>",
          "<h2>Deliverables and success criteria</h2>",
          "<ul><li>[Deliverable / link] — [How success will be measured]</li></ul>",
          "<h2>Risks and decisions needed</h2>",
          "<ul><li>[Risk or open decision] — [Owner] — [Decision date]</li></ul>",
          "<h2>Next actions</h2>",
          "<ul><li>[Owner] — [Action] — [Due date]</li></ul>",
        ].join(""),
      },
      "meeting-notes": {
        emoji: "📝",
        name: "Meeting notes",
        summary: "Capture the agenda, decisions, owners, and follow-ups.",
        pageTitle: `Meeting notes — ${date}`,
        descriptionHtml: [
          `<p><strong>Date:</strong> ${date}</p>`,
          "<p><strong>Facilitator:</strong> [Name]</p>",
          "<p><strong>Attendees:</strong> [Names]</p>",
          "<h2>Purpose and agenda</h2>",
          "<ol><li>[Agenda item]</li></ol>",
          "<h2>Discussion notes</h2>",
          "<ul><li>[Key point, evidence, or link]</li></ul>",
          "<h2>Decisions</h2>",
          "<ul><li>[Decision] — [Decision owner]</li></ul>",
          "<h2>Action items</h2>",
          "<ul><li>[Owner] — [Action] — [Due date]</li></ul>",
          "<h2>Parking lot</h2>",
          "<ul><li>[Topic to revisit]</li></ul>",
        ].join(""),
      },
      retrospective: {
        emoji: "🔁",
        name: "Retrospective",
        summary: "Turn learnings into owned, dated improvements.",
        pageTitle: "Retrospective — [Project / period]",
        descriptionHtml: [
          "<p><strong>Project / period:</strong> [Name]</p>",
          "<p><strong>Owner / DRI:</strong> [Name]</p>",
          "<h2>Outcome and metrics</h2>",
          "<p>[Expected result vs. actual result, with links to evidence]</p>",
          "<h2>What went well</h2>",
          "<ul><li>[Practice or decision worth repeating]</li></ul>",
          "<h2>What did not go well</h2>",
          "<ul><li>[Problem, impact, and likely cause]</li></ul>",
          "<h2>What we learned</h2>",
          "<ul><li>[Learning to carry into future work]</li></ul>",
          "<h2>Improvement actions</h2>",
          "<ul><li>[Owner] — [Action] — [Due date] — [How we will verify]</li></ul>",
        ].join(""),
      },
    },
  }),
  ja: (date) => ({
    heading: "Hotone 社内テンプレート",
    description: "チームでよく使う構成から開始できます。作成後はすべての項目を編集できます。",
    creating: "作成中…",
    templates: {
      blank: {
        emoji: "📄",
        name: "空白ページ",
        summary: "編集可能なタイトル付きの空白ページです。",
        pageTitle: "無題のページ",
        descriptionHtml: "<p></p>",
      },
      "project-brief": {
        emoji: "📋",
        name: "プロジェクト Brief",
        summary: "担当者、目的、範囲、成果物、次のアクションを揃えます。",
        pageTitle: "プロジェクト Brief — [プロジェクト / 製品名]",
        descriptionHtml: [
          "<p><strong>Owner / DRI：</strong>[氏名]</p>",
          "<p><strong>目標日：</strong>[YYYY-MM-DD]</p>",
          "<h2>目的</h2>",
          "<p>[何を達成するのか、なぜ今取り組むのか]</p>",
          "<h2>背景</h2>",
          "<p>[顧客、製品、キャンペーン、または業務上の背景]</p>",
          "<h2>スコープ</h2>",
          "<ul><li><strong>対象：</strong>[このプロジェクトに含むもの]</li><li><strong>対象外：</strong>[このプロジェクトに含まないもの]</li></ul>",
          "<h2>成果物と成功基準</h2>",
          "<ul><li>[成果物 / リンク] — [成功の測定方法]</li></ul>",
          "<h2>リスクと必要な意思決定</h2>",
          "<ul><li>[リスクまたは未決事項] — [担当者] — [決定期限]</li></ul>",
          "<h2>次のアクション</h2>",
          "<ul><li>[担当者] — [アクション] — [期限]</li></ul>",
        ].join(""),
      },
      "meeting-notes": {
        emoji: "📝",
        name: "会議議事録",
        summary: "議題、決定事項、担当者、フォローアップを記録します。",
        pageTitle: `会議議事録 — ${date}`,
        descriptionHtml: [
          `<p><strong>日付：</strong>${date}</p>`,
          "<p><strong>進行：</strong>[氏名]</p>",
          "<p><strong>参加者：</strong>[氏名]</p>",
          "<h2>目的と議題</h2>",
          "<ol><li>[議題]</li></ol>",
          "<h2>議論メモ</h2>",
          "<ul><li>[重要な論点、根拠、またはリンク]</li></ul>",
          "<h2>決定事項</h2>",
          "<ul><li>[決定内容] — [決定責任者]</li></ul>",
          "<h2>アクション項目</h2>",
          "<ul><li>[担当者] — [アクション] — [期限]</li></ul>",
          "<h2>保留事項</h2>",
          "<ul><li>[後で再検討するテーマ]</li></ul>",
        ].join(""),
      },
      retrospective: {
        emoji: "🔁",
        name: "振り返り",
        summary: "学びを、担当者と期限が明確な改善行動に変えます。",
        pageTitle: "振り返り — [プロジェクト / 期間]",
        descriptionHtml: [
          "<p><strong>プロジェクト / 期間：</strong>[名称]</p>",
          "<p><strong>Owner / DRI：</strong>[氏名]</p>",
          "<h2>結果と指標</h2>",
          "<p>[期待した結果と実際の結果。根拠へのリンクを含める]</p>",
          "<h2>うまくいったこと</h2>",
          "<ul><li>[今後も続けるべき取り組みや判断]</li></ul>",
          "<h2>うまくいかなかったこと</h2>",
          "<ul><li>[問題、影響、考えられる原因]</li></ul>",
          "<h2>学んだこと</h2>",
          "<ul><li>[今後の仕事に生かす学び]</li></ul>",
          "<h2>改善アクション</h2>",
          "<ul><li>[担当者] — [アクション] — [期限] — [確認方法]</li></ul>",
        ].join(""),
      },
    },
  }),
  "zh-CN": (date) => ({
    heading: "Hotone 内部模板",
    description: "从团队最常用的结构开始，创建后所有字段都可以编辑。",
    creating: "创建中…",
    templates: {
      blank: {
        emoji: "📄",
        name: "空白页面",
        summary: "从带有可编辑标题的空白页面开始。",
        pageTitle: "未命名页面",
        descriptionHtml: "<p></p>",
      },
      "project-brief": {
        emoji: "📋",
        name: "项目 Brief",
        summary: "对齐负责人、目标、范围、交付物和下一步行动。",
        pageTitle: "项目 Brief — [项目/产品名称]",
        descriptionHtml: [
          "<p><strong>负责人 / DRI：</strong>[姓名]</p>",
          "<p><strong>目标日期：</strong>[YYYY-MM-DD]</p>",
          "<h2>目标</h2>",
          "<p>[我们要取得什么结果，为什么现在要做？]</p>",
          "<h2>背景</h2>",
          "<p>[客户、产品、活动或运营背景]</p>",
          "<h2>范围</h2>",
          "<ul><li><strong>包含：</strong>[本项目包含什么]</li><li><strong>不包含：</strong>[本项目不包含什么]</li></ul>",
          "<h2>交付物与成功标准</h2>",
          "<ul><li>[交付物/链接] — [如何衡量成功]</li></ul>",
          "<h2>风险与待决策事项</h2>",
          "<ul><li>[风险或待决事项] — [负责人] — [决策日期]</li></ul>",
          "<h2>下一步行动</h2>",
          "<ul><li>[负责人] — [行动] — [截止日期]</li></ul>",
        ].join(""),
      },
      "meeting-notes": {
        emoji: "📝",
        name: "会议纪要",
        summary: "记录议程、决定、负责人和后续事项。",
        pageTitle: `会议纪要 — ${date}`,
        descriptionHtml: [
          `<p><strong>日期：</strong>${date}</p>`,
          "<p><strong>主持人：</strong>[姓名]</p>",
          "<p><strong>参会人：</strong>[姓名]</p>",
          "<h2>会议目的与议程</h2>",
          "<ol><li>[议题]</li></ol>",
          "<h2>讨论记录</h2>",
          "<ul><li>[关键观点、依据或链接]</li></ul>",
          "<h2>决定事项</h2>",
          "<ul><li>[决定] — [决策负责人]</li></ul>",
          "<h2>行动项</h2>",
          "<ul><li>[负责人] — [行动] — [截止日期]</li></ul>",
          "<h2>待后续讨论</h2>",
          "<ul><li>[需要稍后重新讨论的主题]</li></ul>",
        ].join(""),
      },
      retrospective: {
        emoji: "🔁",
        name: "复盘",
        summary: "把经验转化为有负责人、有期限的改进行动。",
        pageTitle: "复盘 — [项目/周期]",
        descriptionHtml: [
          "<p><strong>项目 / 周期：</strong>[名称]</p>",
          "<p><strong>负责人 / DRI：</strong>[姓名]</p>",
          "<h2>结果与指标</h2>",
          "<p>[预期结果与实际结果，并附上数据或证据链接]</p>",
          "<h2>做得好的地方</h2>",
          "<ul><li>[值得继续的做法或决定]</li></ul>",
          "<h2>做得不好的地方</h2>",
          "<ul><li>[问题、影响和可能的原因]</li></ul>",
          "<h2>获得的经验</h2>",
          "<ul><li>[以后工作中需要沿用的经验]</li></ul>",
          "<h2>改进行动</h2>",
          "<ul><li>[负责人] — [行动] — [截止日期] — [验证方式]</li></ul>",
        ].join(""),
      },
    },
  }),
};

const normalizeTemplateLocale = (locale: TLanguage): TTemplateLocale => {
  if (locale === "ja") return "ja";
  if (locale === "zh-CN") return "zh-CN";
  return "en";
};

const getISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getPageTemplateCopy = (locale: TLanguage, now = new Date()): TPageTemplateCopy =>
  TEMPLATE_COPY[normalizeTemplateLocale(locale)](getISODate(now));

export const getPageTemplates = (locale: TLanguage, now = new Date()): TPageTemplate[] => {
  const copy = getPageTemplateCopy(locale, now);
  return [
    { id: "blank", ...copy.templates.blank },
    { id: "project-brief", ...copy.templates["project-brief"] },
    { id: "meeting-notes", ...copy.templates["meeting-notes"] },
    { id: "retrospective", ...copy.templates.retrospective },
  ];
};

export const getPageTemplatePayload = (
  locale: TLanguage,
  templateId: TPageTemplateId,
  now = new Date()
): Pick<TPage, "name" | "description_html"> => {
  const templates = getPageTemplates(locale, now);
  const template = templates.find(({ id }) => id === templateId);
  const fallback = templates[0];

  return {
    name: template?.pageTitle ?? fallback.pageTitle,
    description_html: template?.descriptionHtml ?? fallback.descriptionHtml,
  };
};
