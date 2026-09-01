import type { CsvImportError, DemoLicenseStatus } from "@emotion-studio/contracts";
import { AppError } from "../errors.js";
import type { ContentAnalyzer } from "./analyzer.js";
import type { NewContentItem } from "./repository.js";

export interface ParsedCsvCandidate {
  row: number;
  item: NewContentItem;
}

export interface ParsedCsvImport {
  totalRows: number;
  candidates: ParsedCsvCandidate[];
  errors: CsvImportError[];
}

const MAX_CSV_DATA_ROWS = 10_000;
const MAX_CSV_COLUMNS = 20;
const MAX_CONTENT_LENGTH = 4_000;
const MAX_AUTHOR_LENGTH = 100;
const MAX_SOURCE_LENGTH = 200;
const MAX_URL_LENGTH = 2_048;

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let justClosedQuote = false;

  const pushField = () => {
    if (row.length >= MAX_CSV_COLUMNS) {
      throw new AppError(
        400,
        "CSV_COLUMN_LIMIT",
        `CSV 单行最多支持 ${MAX_CSV_COLUMNS} 列`,
      );
    }
    row.push(field);
  };

  const pushRow = () => {
    if (rows.length >= MAX_CSV_DATA_ROWS + 1) {
      throw new AppError(
        400,
        "CSV_ROW_LIMIT",
        `CSV 单次最多支持 ${MAX_CSV_DATA_ROWS} 行数据`,
      );
    }
    rows.push(row);
  };

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];

    if (character === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (inQuotes) {
        inQuotes = false;
        justClosedQuote = true;
      } else if (field.length === 0 && !justClosedQuote) {
        inQuotes = true;
      } else {
        throw new AppError(400, "CSV_INVALID", "CSV 中存在位置无效的引号");
      }
      continue;
    }

    if (!inQuotes && character === ",") {
      pushField();
      field = "";
      justClosedQuote = false;
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      pushField();
      pushRow();
      row = [];
      field = "";
      justClosedQuote = false;
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
      continue;
    }

    if (justClosedQuote) {
      throw new AppError(400, "CSV_INVALID", "CSV 引号结束后只能使用分隔符或换行");
    }

    field += character;
  }

  if (inQuotes) {
    throw new AppError(400, "CSV_INVALID", "CSV 中存在未闭合的引号");
  }

  if (field.length > 0 || row.length > 0 || justClosedQuote) {
    pushField();
    pushRow();
  }

  return rows;
}

function parseHttpUrl(value: string): string | null | undefined {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_URL_LENGTH) return undefined;
  try {
    const url = new URL(cleaned);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parseLikes(value: string): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER
    ? Math.floor(parsed)
    : 0;
}

export async function parseContentCsv(
  csvText: string,
  licenseStatus: DemoLicenseStatus,
  sourceName: string | undefined,
  analyzer: ContentAnalyzer,
  importedAt = new Date().toISOString(),
): Promise<ParsedCsvImport> {
  const rows = parseCsvRows(csvText);
  const headerRow = rows[0];
  if (!headerRow) {
    throw new AppError(400, "CSV_EMPTY", "CSV 文件没有可读取的表头");
  }

  const headers = headerRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim().toLocaleLowerCase("en-US"),
  );
  const contentIndex = headers.indexOf("content");
  if (contentIndex < 0) {
    throw new AppError(400, "CSV_CONTENT_REQUIRED", "CSV 必须包含 content 表头");
  }

  const authorIndex = headers.indexOf("author");
  const likesIndex = headers.indexOf("likes");
  const sourceIndex = headers.indexOf("source");
  const urlIndex = headers.indexOf("url");
  const dataRows = rows.slice(1);
  const candidates: ParsedCsvCandidate[] = [];
  const errors: CsvImportError[] = [];

  for (const [index, values] of dataRows.entries()) {
    const rowNumber = index + 2;
    const originalContent = values[contentIndex] ?? "";
    const content = originalContent.trim();
    if (!content) {
      errors.push({ row: rowNumber, message: "content 不能为空" });
      continue;
    }
    if (originalContent.length > MAX_CONTENT_LENGTH || content.length > MAX_CONTENT_LENGTH) {
      errors.push({ row: rowNumber, message: `content 不能超过 ${MAX_CONTENT_LENGTH} 个字符` });
      continue;
    }

    const sourceUrl = parseHttpUrl(urlIndex >= 0 ? (values[urlIndex] ?? "") : "");
    if (sourceUrl === undefined) {
      errors.push({ row: rowNumber, message: "url 必须是有效的 http(s) 地址" });
      continue;
    }

    const authorValue = authorIndex >= 0 ? (values[authorIndex] ?? "").trim() : "";
    const sourceValue = sourceIndex >= 0 ? (values[sourceIndex] ?? "").trim() : "";
    if (authorValue.length > MAX_AUTHOR_LENGTH) {
      errors.push({ row: rowNumber, message: `author 不能超过 ${MAX_AUTHOR_LENGTH} 个字符` });
      continue;
    }
    if (sourceValue.length > MAX_SOURCE_LENGTH) {
      errors.push({ row: rowNumber, message: `source 不能超过 ${MAX_SOURCE_LENGTH} 个字符` });
      continue;
    }
    const likes = parseLikes(likesIndex >= 0 ? (values[likesIndex] ?? "") : "");
    const analysis = await analyzer.analyze({ content, likes });

    candidates.push({
      row: rowNumber,
      item: {
        originalContent,
        content,
        author: authorValue || null,
        likes,
        source: sourceValue || sourceName || "CSV 导入",
        sourceUrl,
        licenseStatus,
        ...analysis.data,
        isFavorite: false,
        importedAt,
      },
    });
  }

  return { totalRows: dataRows.length, candidates, errors };
}
