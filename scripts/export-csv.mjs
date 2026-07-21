// Xuất toàn bộ 12 bảng Supabase ra file CSV để backup trước khi đưa bản mới lên chính thức.
// Chạy:  npm run export-csv
// Sẽ hỏi email/mật khẩu ngay trên terminal — không lưu ở đâu cả, chỉ gửi thẳng tới Supabase để
// đăng nhập (giống hệt lúc đăng nhập app thật), vì các bảng có RLS yêu cầu đã đăng nhập mới đọc
// được. Kết quả nằm trong backup/<ngày>/ , đã thêm backup/ vào .gitignore vì đây là dữ liệu
// khách hàng thật (tên, SĐT, công nợ) — KHÔNG được commit lên git.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(rootDir, ".env");
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Không tìm thấy VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env");
  process.exit(1);
}

// Đúng 12 bảng theo CLAUDE.md — thứ tự không quan trọng.
const TABLES = [
  "products", "customers", "partners", "partner_contacts", "partner_prices",
  "sales_orders", "sales_order_lines", "purchase_orders", "purchase_order_lines",
  "pending_demand", "stock_log", "debt_log",
];

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(","));
  return lines.join("\n");
}

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("Email đăng nhập: ");
  const password = await rl.question("Mật khẩu: ");
  rl.close();

  console.log("\nĐang đăng nhập...");
  const { error: loginErr } = await sb.auth.signInWithPassword({ email, password });
  if (loginErr) {
    console.error("Đăng nhập thất bại:", loginErr.message);
    process.exit(1);
  }
  console.log("Đăng nhập thành công.\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = path.join(rootDir, "backup", stamp);
  mkdirSync(outDir, { recursive: true });

  for (const table of TABLES) {
    process.stdout.write(`Đang tải bảng "${table}"... `);
    const { data, error } = await sb.from(table).select("*");
    if (error) {
      console.log(`LỖI: ${error.message}`);
      continue;
    }
    const csv = toCsv(data || []);
    const filePath = path.join(outDir, `${table}.csv`);
    // Thêm BOM để Excel mở file không bị lỗi font tiếng Việt.
    writeFileSync(filePath, "﻿" + csv, "utf8");
    console.log(`${data.length} dòng -> ${path.relative(rootDir, filePath)}`);
  }

  console.log(`\nXong! Toàn bộ file CSV nằm trong: ${path.relative(rootDir, outDir)}/`);
  await sb.auth.signOut();
  process.exit(0);
}

main().catch((err) => {
  console.error("Lỗi không mong đợi:", err);
  process.exit(1);
});
