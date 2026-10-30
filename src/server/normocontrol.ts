import { DOMParser } from "@xmldom/xmldom";
import { extractText, readDocx, type ExtractedText } from "./extraction";
import type { NormocontrolReport } from "../shared/normocontrol";

// Port of analyzer.py / extractors.py, normocontrol-offline 5494ca23684eb653602e057e39942eb3da2c93a7.
// Rules are heuristics for human review, not a certificate of compliance with a standard.
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const elements = (node: Element, name: string) =>
  Array.from(node.getElementsByTagNameNS(W, name));
const LIMIT = 300;
export async function normocontrol(
  filename: string,
  bytes: Uint8Array,
  extracted?: ExtractedText,
): Promise<NormocontrolReport> {
  const report: NormocontrolReport = {
    engine: "normocontrol-offline/5494ca2 + eosdo/1",
    checked_at: new Date().toISOString(),
    state: "ready",
    notice:
      "Рекомендации для проверки человеком. Оригинал не изменён. Актуальность нормативных ссылок, OCR и соответствие всем требованиям ГОСТ не проверяются.",
    findings: [],
  };
  const add = (
    category: string,
    severity: "low" | "medium" | "review",
    message: string,
    location: string,
    quote: string,
    suggestion: string,
  ) => {
    if (report.findings.length >= LIMIT) {
      report.state = "limited";
      return;
    }
    report.findings.push({
      category,
      severity,
      message,
      location,
      quote: quote.slice(0, 500),
      suggestion,
    });
  };
  try {
    const source = extracted ?? (await extractText(filename, bytes));
    if (source.text === null) {
      report.state = "unavailable";
      report.notice =
        source.extraction_error ?? "Текст недоступен. Нужна ручная проверка.";
      return report;
    }
    const textFindings = (text: string, location: string) => {
      const spaces = [
        ...text.matchAll(/(?<=[A-Za-zА-Яа-яЁё]) {2,3}(?=[A-Za-zА-Яа-яЁё])/g),
      ];
      const excerpt = (index: number) =>
        text.slice(Math.max(0, index - 200), index + 200);
      if (!text.includes("\t") && spaces.length <= 3)
        for (const match of spaces)
          add(
            "spacing",
            "low",
            "Несколько пробелов внутри текста",
            location,
            excerpt(match.index),
            "Заменить повторные пробелы одним; проверить выравнивание.",
          );
      for (const match of text.matchAll(/\s+([,.;:!?])/g))
        add(
          "punctuation",
          "medium",
          "Пробел перед знаком препинания",
          location,
          excerpt(match.index),
          `Убрать пробел перед «${match[1]}».`,
        );
    };
    if (!/\.docx$/i.test(filename)) {
      report.notice +=
        " Проверен только извлечённый текст; оформление, таблицы и колонтитулы не проверены.";
      source.text
        .replaceAll("\r\n", "\n")
        .split("\n")
        .forEach((line, index) => textFindings(line, `Строка ${index + 1}`));
    } else {
      let fields = 0,
        headers = 0;
      for (const [part, xml] of readDocx(bytes)) {
        const fail = () => {
          throw new Error("Некорректный XML DOCX");
        };
        const root = new DOMParser({
          errorHandler: { warning: fail, error: fail, fatalError: fail },
        }).parseFromString(xml, "application/xml").documentElement;
        if (!root) throw new Error("Нет корневого элемента DOCX");
        fields += ["fldSimple", "instrText", "fldChar"].reduce(
          (sum, name) => sum + elements(root, name).length,
          0,
        );
        for (const [index, p] of elements(root, "p").entries()) {
          const text = elements(p, "t")
            .map((t) => t.textContent ?? "")
            .join("");
          const location = `${part} · абзац ${index + 1}`;
          if (/\/(header|footer)\d+\.xml$/.test(part) && text.trim()) headers++;
          // A tab denotes tabular alignment; preserve the upstream spacing exception.
          textFindings(
            elements(p, "tab").length ? "\t" + text : text,
            location,
          );
          const ppr = elements(p, "pPr")[0];
          if (
            text.trim().length > 80 &&
            (!ppr || !elements(ppr, "pStyle").length)
          )
            add(
              "style",
              "review",
              "Длинный абзац без явного стиля Word",
              location,
              text,
              "Проверить применение стилей документа; стиль может наследоваться.",
            );
          if (
            /^\s*(?:\d+(?:\.\d+)*|[а-яА-Яa-zA-Z])[).]\s+\S/.test(text) &&
            (!ppr || !elements(ppr, "numPr").length)
          )
            add(
              "numbering",
              "medium",
              "Возможная ручная нумерация",
              location,
              text,
              "Проверить автоматическую нумерацию Word.",
            );
          if (
            (elements(p, "drawing").length || elements(p, "pict").length) &&
            !/^(?:рисунок|таблица|схема|приложение)\s+[\dА-ЯA-Z]/i.test(
              text.trim(),
            )
          )
            add(
              "caption",
              "review",
              "Объект без подписи в том же абзаце",
              location,
              text,
              "Проверить подпись рядом с объектом: она может находиться в соседнем абзаце.",
            );
        }
        for (const table of elements(root, "tbl"))
          if (!elements(table, "tr").length)
            add(
              "table",
              "medium",
              "Таблица без строк",
              part,
              "",
              "Проверить структуру таблицы.",
            );
        for (const section of elements(root, "sectPr"))
          if (!elements(section, "pgMar").length)
            add(
              "layout",
              "review",
              "Раздел без явных полей страницы",
              part,
              "",
              "Проверить поля и параметры страницы.",
            );
      }
      if (!fields)
        add(
          "fields",
          "review",
          "В DOCX не найдены поля Word",
          "Документ",
          "",
          "Проверить содержание, номера страниц, ссылки и автоматические поля.",
        );
      if (!headers)
        add(
          "headers",
          "review",
          "Не найдены текстовые колонтитулы Word",
          "Документ",
          "",
          "Проверить наличие и оформление колонтитулов.",
        );
    }
    if (report.state === "limited")
      report.notice += ` Показаны первые ${LIMIT} замечаний; проверка неполная.`;
    return report;
  } catch {
    return {
      ...report,
      state: "unavailable",
      findings: [],
      notice:
        "Не удалось проверить структуру документа. Оригинал сохранён; нужна ручная проверка.",
    };
  }
}
