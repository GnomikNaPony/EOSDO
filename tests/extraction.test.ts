import { describe, expect, test } from "bun:test";
import { crc32, deflateRawSync } from "node:zlib";
import { searchableText as extractText } from "../src/server/search";

// Real, generated PDF objects/xref and OOXML ZIP packages, not filename-only mocks.
function pdfFile(texts: (string | null)[]) {
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [
      2,
      `<< /Type /Pages /Count ${texts.length} /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    ],
    [3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
  ]);
  const imageId = 4 + texts.length * 2;
  for (const [i, text] of texts.entries()) {
    const pageId = 4 + i * 2;
    const stream =
      text === null
        ? "q 200 0 0 200 40 540 cm /Im0 Do Q"
        : `BT /F1 12 Tf 14 TL 40 740 Td ${Array.from(text.matchAll(/.{1,70}/gs), (match) => `(${match[0].replace(/[\\()]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    );
    objects.set(
      pageId + 1,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.set(
    imageId,
    "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nFFFFFF>\nendstream",
  );
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [id, value] of objects) {
    offsets[id] = Buffer.byteLength(source);
    source += `${id} 0 obj\n${value}\nendobj\n`;
  }
  const start = Buffer.byteLength(source);
  source += `xref\n0 ${objects.size + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objects.size; id++)
    source += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(
    source +
      `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`,
  );
}
function zipFile(entries: Record<string, string>) {
  const parts: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name),
      raw = Buffer.from(value),
      compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    filename.copy(central, 46);
    parts.push(local, compressed);
    directory.push(central);
    offset += local.length + compressed.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}
const xml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const paragraph = (value: string) =>
  `<w:p><w:r><w:t>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</w:t></w:r></w:p>`;
function docxFile(body: string) {
  return zipFile({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": xml(body),
  });
}

describe("shared document extraction", () => {
  test("reads real text-layer PDF and preserves original bytes", async () => {
    const bytes = pdfFile([
      "Heliotrope maintenance schedule",
      "Second page: 29 October 2026",
    ]);
    const original = Buffer.from(bytes);
    const result = await extractText("schedule.PDF", bytes);
    expect(result.extraction_error).toBeNull();
    expect(result.text).toContain("Heliotrope maintenance schedule");
    expect(result.text).toContain("Second page: 29 October 2026");
    expect(bytes.equals(original)).toBe(true);
  });
  test("reads DOCX paragraphs and table cells without returning markup", async () => {
    const bytes = docxFile(
      paragraph("План гелиотропных работ & сроки") +
        `<w:tbl><w:tr><w:tc>${paragraph("Ответственный: Иванов")}</w:tc><w:tc>${paragraph("29 октября 2026")}</w:tc></w:tr></w:tbl>`,
    );
    const original = Buffer.from(bytes);
    const result = await extractText("plan.docx", bytes);
    expect(result.extraction_error).toBeNull();
    expect(result.text).toContain("План гелиотропных работ & сроки");
    expect(result.text).toContain("Ответственный: Иванов");
    expect(result.text).toContain("29 октября 2026");
    expect(result.text).not.toContain("<w:");
    expect(bytes.equals(original)).toBe(true);
  });
  test("image-only PDFs report an OCR requirement, not a successful empty index", async () => {
    const result = await extractText("scan.pdf", pdfFile([null]));
    expect(result.text).toBeNull();
    expect(result.extraction_error).toContain("OCR");
  });
  test("corrupt PDF, DOCX, empty files and invalid UTF-8 have explicit errors", async () => {
    for (const [name, bytes] of [
      ["bad.pdf", Buffer.from("%PDF-1.7\nnot a document")],
      ["bad.docx", Buffer.from("not ZIP")],
      ["missing.docx", zipFile({ "empty.txt": "not OOXML" })],
      ["bad.csv", new Uint8Array([0xff, 0xff])],
      ["empty.docx", docxFile("")],
      ["empty.txt", Buffer.from(" \n")],
      ["no.txt", new Uint8Array()],
      ["sheet.xlsx", Buffer.from("not supported")],
    ] as const) {
      const result = await extractText(name, bytes);
      expect(result.text).toBeNull();
      expect(result.extraction_error).toBeTruthy();
    }
  });
  test("UTF-8 text limits are inclusive and no oversized result is silently truncated", async () => {
    for (const ext of ["txt", "md", "csv"]) {
      expect(
        (await extractText("ok." + ext, Buffer.from("a".repeat(45000)))).text
          ?.length,
      ).toBe(45000);
      expect(
        await extractText("too-long." + ext, Buffer.from("a".repeat(45001))),
      ).toEqual({
        text: null,
        extraction_error: expect.stringContaining("45 000"),
      });
    }
    expect(
      (await extractText("bom.txt", new Uint8Array([0xef, 0xbb, 0xbf, 65])))
        .text,
    ).toBe("A");
    expect(
      (await extractText("huge.pdf", new Uint8Array(20 * 1024 * 1024 + 1)))
        .extraction_error,
    ).toContain("20 МБ");
  });
  test("PDF page/text and DOCX expanded/text limits fail explicitly", async () => {
    expect(
      (
        await extractText(
          "pages.pdf",
          pdfFile(Array.from({ length: 201 }, () => "Page")),
        )
      ).extraction_error,
    ).toContain("200");
    expect(
      (
        await extractText(
          "large.pdf",
          pdfFile(Array.from({ length: 20 }, () => "a".repeat(3000))),
        )
      ).extraction_error,
    ).toContain("45 000");
    expect(
      (await extractText("large.docx", docxFile(paragraph("a".repeat(45001)))))
        .extraction_error,
    ).toContain("45 000");
    const expanded = docxFile(paragraph("Short"));
    const central = expanded.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expanded.writeUInt32LE(50 * 1024 * 1024 + 1, central + 24);
    expect(
      (await extractText("bomb.docx", expanded)).extraction_error,
    ).toContain("50 МБ");
  });
  test("DOCX integrity and resource checks precede conversion", async () => {
    const corrupt = docxFile(paragraph("Check CRC"));
    corrupt.writeUInt32LE(0, 14);
    expect((await extractText("crc.docx", corrupt)).text).toBeNull();
    const count = docxFile(paragraph("Count"));
    count.writeUInt16LE(2001, count.length - 12);
    expect(
      (await extractText("entries.docx", count)).extraction_error,
    ).toContain("2000");
    const forged = docxFile(paragraph("a".repeat(10000)));
    const central = forged.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 4,
    );
    // Last content member announces a tiny size despite its compressed output.
    let index = forged.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      central + 4,
    );
    forged.writeUInt32LE(1, index + 24);
    expect((await extractText("forged.docx", forged)).text).toBeNull();
  });
  test("independent concurrent extractions cannot leak text across files", async () => {
    const results = await Promise.all([
      extractText("one.pdf", pdfFile(["First heliotrope"])),
      extractText("two.docx", docxFile(paragraph("Второй документ"))),
    ]);
    expect(results[0]?.text).toContain("First heliotrope");
    expect(results[0]?.text).not.toContain("Второй");
    expect(results[1]?.text).toContain("Второй документ");
    expect(results[1]?.text).not.toContain("heliotrope");
  });
});
