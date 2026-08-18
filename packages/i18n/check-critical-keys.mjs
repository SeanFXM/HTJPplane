/**
 * Checks literal translation keys used by Hotone Japan's critical desktop flows.
 *
 * Dynamic keys are intentionally ignored: they need domain-specific expansion and
 * treating them as literals would create noisy false positives.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const criticalPaths = [
  "apps/web/app/(all)/[workspaceSlug]/(projects)/header.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/page.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId]",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(list)",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/issues/(list)/page.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(list)/page.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(list)/header.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(detail)/[pageId]/page.tsx",
  "apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)",
  "apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects",
  "apps/web/ce/components/projects",
  "apps/web/core/components/home",
  "apps/web/core/components/account/auth-forms",
  "apps/web/core/components/auth-screens",
  "apps/web/core/components/profile",
  "apps/web/core/components/project/card-list.tsx",
  "apps/web/core/components/project/card.tsx",
  "apps/web/core/components/project/root.tsx",
  "apps/web/core/components/project/applied-filters",
  "apps/web/core/components/project/dropdowns/filters",
  "apps/web/core/components/workspace/sidebar",
  "apps/web/core/components/issues/issue-detail",
  "apps/web/core/components/issues/issue-detail-widgets",
  "apps/web/core/components/issues/issue-layouts/filters/header",
  "apps/web/core/components/issues/archive-issue-modal.tsx",
  "apps/web/core/components/issues/archived-issues-header.tsx",
  "apps/web/core/components/issues/delete-issue-modal.tsx",
  "apps/web/core/components/issues/issue-layouts/empty-states/archived-issues.tsx",
  "apps/web/core/components/pages",
  "apps/web/core/components/settings/workspace",
  "apps/web/core/components/workspace/settings",
];

const localeFiles = ["core", "translations", "accessibility", "editor", "empty-state"];
const locales = ["ja", "zh-CN", "en"];

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

async function loadLocale(locale) {
  const messages = {};
  const modules = await Promise.all(
    localeFiles.map((file) => {
      const modulePath = path.join(repositoryRoot, "packages/i18n/src/locales", locale, `${file}.ts`);
      if (!fs.existsSync(modulePath)) return undefined;
      return import(pathToFileURL(modulePath).href);
    })
  );
  for (const module of modules) {
    if (!module) continue;
    deepMerge(messages, module.default);
  }
  return messages;
}

function getMessage(messages, key) {
  return key.split(".").reduce((value, segment) => value?.[segment], messages);
}

function collectSourceFiles(entryPath) {
  if (!fs.existsSync(entryPath)) return [];
  const stats = fs.statSync(entryPath);
  if (stats.isFile()) return /\.[cm]?[jt]sx?$/.test(entryPath) ? [entryPath] : [];

  return fs.readdirSync(entryPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "mobile" || entry.name === "__tests__") return [];
      return collectSourceFiles(childPath);
    }
    if (/^mobile[-.]/.test(entry.name)) return [];
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [childPath] : [];
  });
}

function collectLiteralTranslationCalls(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  if (!sourceText.includes("useTranslation")) return [];

  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "t" &&
      node.arguments.length > 0 &&
      (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.arguments[0].getStart(sourceFile));
      calls.push({ key: node.arguments[0].text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

const messagesByLocale = Object.fromEntries(
  await Promise.all(locales.map(async (locale) => [locale, await loadLocale(locale)]))
);
const sourceFiles = [
  ...new Set(criticalPaths.flatMap((entry) => collectSourceFiles(path.join(repositoryRoot, entry)))),
].toSorted();
const usages = sourceFiles.flatMap((filePath) =>
  collectLiteralTranslationCalls(filePath).map((call) => ({
    key: call.key,
    line: call.line,
    file: path.relative(repositoryRoot, filePath),
  }))
);

const missing = [];
for (const usage of usages) {
  for (const locale of locales) {
    if (typeof getMessage(messagesByLocale[locale], usage.key) !== "string") {
      missing.push({ ...usage, locale });
    }
  }
}

if (missing.length > 0) {
  console.error(`Critical i18n check failed with ${missing.length} missing locale entries:`);
  for (const item of missing) {
    console.error(`- ${item.locale}: ${item.key} (${item.file}:${item.line})`);
  }
  process.exitCode = 1;
} else {
  const uniqueKeys = new Set(usages.map(({ key }) => key));
  console.log(
    `Critical i18n check passed: ${uniqueKeys.size} literal keys across ${sourceFiles.length} desktop-flow files are complete for ${locales.join(", ")}.`
  );
}
