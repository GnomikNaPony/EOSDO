import { crc32, inflateRawSync } from "node:zlib";
import mammoth from "mammoth";
import { getDocumentProxy } from "unpdf";

export interface ExtractedText {
  text: string | null;
  extraction_error: string | null;
}
const MAX_FILE = 20 * 1024 * 1024;
const MAX_TEXT = 45000;
const MAX_UNPACKED = 50 * 1024 * 1024;
class ExtractionError extends Error {}
function fail(message: string): never {
  throw new ExtractionError(message + " Оригинал сохранён.");
}
function checkedText(text: string): string {
  const cleaned = text.replaceAll("\0", "");
  if (cleaned.length > MAX_TEXT)
    fail("Текст превышает лимит извлечения: 45 000 символов.");
  if (!cleaned.trim()) fail("В файле нет текста для поиска.");
  return cleaned;
}

/** Verify bounded ZIP members before Mammoth opens the same immutable OOXML bytes. */
export function readDocx(bytes: Uint8Array) {
  const entries = new Map<string, string>();
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65557);
    offset--
  ) {
    if (
      data.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) fail("Повреждённый DOCX: не найден каталог ZIP.");
  const count = data.readUInt16LE(end + 10);
  if (count > 2000) fail("DOCX содержит больше 2000 элементов ZIP.");
  const start = data.readUInt32LE(end + 16),
    size = data.readUInt32LE(end + 12);
  if (
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    data.readUInt16LE(end + 8) !== count ||
    start + size !== end
  )
    fail("Повреждённый или неподдерживаемый ZIP-каталог DOCX.");
  let position = start,
    expanded = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || data.readUInt32LE(position) !== 0x02014b50)
      fail("Повреждённый DOCX: неверная запись ZIP.");
    const flags = data.readUInt16LE(position + 8),
      method = data.readUInt16LE(position + 10);
    const compressed = data.readUInt32LE(position + 20),
      unpacked = data.readUInt32LE(position + 24);
    const nameSize = data.readUInt16LE(position + 28),
      extraSize = data.readUInt16LE(position + 30),
      commentSize = data.readUInt16LE(position + 32);
    const next = position + 46 + nameSize + extraSize + commentSize;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      data.readUInt16LE(position + 34)
    )
      fail("Повреждённый или зашифрованный DOCX. Нужна доступная копия.");
    const name = data
      .subarray(position + 46, position + 46 + nameSize)
      .toString("utf8");
    if (names.has(name)) fail("Повреждённый DOCX: повторяющийся элемент ZIP.");
    names.add(name);
    expanded += unpacked;
    if (expanded > MAX_UNPACKED) fail("Распакованный DOCX превышает 50 МБ.");
    const local = data.readUInt32LE(position + 42);
    if (
      local + 30 > start ||
      data.readUInt32LE(local) !== 0x04034b50 ||
      data.readUInt16LE(local + 8) !== method ||
      data.readUInt16LE(local + 6) !== flags
    )
      fail("Повреждённый DOCX: заголовки ZIP не совпадают.");
    const localName = data.readUInt16LE(local + 26);
    const payload = local + 30 + localName + data.readUInt16LE(local + 28);
    if (
      localName !== nameSize ||
      !data
        .subarray(local + 30, local + 30 + localName)
        .equals(data.subarray(position + 46, position + 46 + nameSize)) ||
      payload + compressed > start
    )
      fail("Повреждённый DOCX: недопустимые границы ZIP.");
    if (
      !(flags & 8) &&
      (data.readUInt32LE(local + 14) !== data.readUInt32LE(position + 16) ||
        data.readUInt32LE(local + 18) !== compressed ||
        data.readUInt32LE(local + 22) !== unpacked)
    )
      fail(
        "Повреждённый DOCX: размеры или контрольная сумма ZIP не совпадают.",
      );
    const raw = data.subarray(payload, payload + compressed);
    let decoded: Uint8Array;
    try {
      // The real inflation limit also rejects forged uncompressed-size declarations.
      decoded =
        method === 0
          ? raw
          : inflateRawSync(raw, { maxOutputLength: Math.max(1, unpacked) });
    } catch {
      fail("Повреждённый DOCX или превышен заявленный объём распаковки.");
    }
    if (
      decoded.length !== unpacked ||
      crc32(decoded) !== data.readUInt32LE(position + 16)
    )
      fail("Повреждённый DOCX: неверная контрольная сумма ZIP.");
    if (
      /\.xml$/i.test(name) &&
      Buffer.from(decoded).includes(Buffer.from("<!DOCTYPE"))
    )
      fail("DOCX с объявлениями DTD не поддерживается.");
    if (
      /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(
        name,
      )
    )
      entries.set(
        name,
        new TextDecoder("utf-8", { fatal: true }).decode(decoded),
      );
    position = next;
  }
  if (
    position !== end ||
    !names.has("word/document.xml") ||
    !names.has("[Content_Types].xml")
  )
    fail("Файл не содержит корректного документа DOCX.");
  return entries;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  // PDF.js may transfer its input buffer. A private copy keeps uploaded original bytes intact.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: true,
    maxImageSize: 16_777_216,
    verbosity: 0,
  });
  try {
    if (pdf.numPages > 200) fail("PDF содержит больше 200 страниц.");
    let text = "";
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        if (number > 1) text += "\n";
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += item.str + (item.hasEOL ? "\n" : "");
          if (text.length > MAX_TEXT)
            fail("Текст превышает лимит извлечения: 45 000 символов.");
        }
      } finally {
        page.cleanup();
      }
    }
    if (!text.trim())
      fail("В PDF нет текстового слоя. Нужны OCR или ручная проверка.");
    return text;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Independent from AI rules: text is derived data; original bytes are never rewritten. */
export async function extractText(
  filename: string,
  bytes: Uint8Array,
): Promise<ExtractedText> {
  try {
    if (bytes.byteLength > MAX_FILE) fail("Файл превышает лимит 20 МБ.");
    if (!bytes.byteLength) fail("Файл пуст.");
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    let text: string;
    if ([".txt", ".md", ".csv"].includes(ext ?? "")) {
      if (bytes.byteLength > 180000)
        fail("Текст превышает лимит извлечения: 45 000 символов.");
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        fail(
          "Не удалось извлечь текст UTF-8. Сохраните текст в UTF-8 или проверьте вручную.",
        );
      }
    } else if (ext === ".pdf") {
      try {
        text = await pdfText(bytes);
      } catch (error) {
        if (error instanceof ExtractionError) throw error;
        if (error instanceof Error && error.name === "PasswordException")
          fail("PDF защищён паролем. Нужна доступная копия.");
        fail(
          "Не удалось прочитать PDF. Файл повреждён или использует неподдерживаемую структуру.",
        );
      }
    } else if (ext === ".docx") {
      readDocx(bytes);
      try {
        const result = await mammoth.extractRawText({
          buffer: Buffer.from(bytes),
        });
        if (result.messages.some((message) => message.type === "error"))
          fail("Не удалось извлечь весь текст DOCX. Нужна ручная проверка.");
        text = result.value;
      } catch (error) {
        if (error instanceof ExtractionError) throw error;
        fail(
          "Не удалось прочитать DOCX. Файл повреждён или использует неподдерживаемую структуру.",
        );
      }
    } else {
      fail(
        ext === ".xlsx"
          ? "Извлечение XLSX пока недоступно. Используйте имя файла или реквизиты."
          : "Формат файла не поддерживает извлечение текста.",
      );
    }
    return { text: checkedText(text), extraction_error: null };
  } catch (error) {
    return {
      text: null,
      extraction_error:
        error instanceof ExtractionError
          ? error.message
          : "Извлечение текста недоступно. Проверьте исходный файл вручную. Оригинал сохранён.",
    };
  }
}
