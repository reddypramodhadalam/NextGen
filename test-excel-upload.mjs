import { readFileSync } from "fs";
import { resolve } from "path";

const filePath = resolve("test-upload-sample.xlsx");
const fileBytes = readFileSync(filePath);

const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
const CRLF = "\r\n";

const header =
  `--${boundary}${CRLF}` +
  `Content-Disposition: form-data; name="file"; filename="test-upload-sample.xlsx"${CRLF}` +
  `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet${CRLF}` +
  `${CRLF}`;

const footer = `${CRLF}--${boundary}--${CRLF}`;

const body = Buffer.concat([
  Buffer.from(header, "binary"),
  fileBytes,
  Buffer.from(footer, "binary"),
]);

console.log(`Sending ${fileBytes.length} bytes of Excel data...`);

const res = await fetch("http://localhost:5000/api/upload/parse-excel", {
  method: "POST",
  headers: {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": String(body.length),
  },
  body,
});

const text = await res.text();
console.log("HTTP Status:", res.status);
console.log("Response:", text.slice(0, 500));

try {
  const json = JSON.parse(text);
  if (json.testCases) {
    console.log(`\n✅ Parsed ${json.testCases.length} test cases:`);
    json.testCases.forEach(tc => console.log(`  [${tc.priority?.toUpperCase()}] ${tc.title}`));
  }
  if (json.errors?.length) {
    console.log(`\n⚠️  Errors: ${json.errors.join(", ")}`);
  }
} catch {
  console.log("Response is not JSON");
}
