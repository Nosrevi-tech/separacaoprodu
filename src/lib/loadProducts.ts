import * as XLSX from "xlsx";

/**
 * Parse a price string to integer cents without floating-point multiplication.
 * "13.9" → 1390, "5.50" → 550, "420" → 42000, "0.5" → 50
 */
function parseToCents(s: string): number {
  const cleaned = s.replace(",", ".");
  const parts = cleaned.split(".");
  const intPart = parseInt(parts[0] || "0", 10);
  if (isNaN(intPart)) return 0;
  if (parts.length === 1) return intPart * 100;
  // Pad or trim decimal to exactly 2 digits
  const decStr = (parts[1] || "0").slice(0, 2).padEnd(2, "0");
  const decPart = parseInt(decStr, 10);
  if (isNaN(decPart)) return intPart * 100;
  return intPart * 100 + decPart;
}
export interface Product {
  id: number;
  code: string;
  barcode: string;
  description: string;
  unit: string;
  stock: number;
  unitPrice: number; // in cents
}

function normalize(s: any): string {
  if (s == null) return "";
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g, " ").trim();
}

function findCol(headers: any[], names: string[]): number {
  const nh = headers.map((h) => normalize(h));
  const nn = names.map(normalize);
  for (const n of nn) {
    const idx = nh.indexOf(n);
    if (idx !== -1) return idx;
  }
  for (const n of nn) {
    const idx = nh.findIndex((h) => h && h.startsWith(n));
    if (idx !== -1) return idx;
  }
  for (const n of nn) {
    const idx = nh.findIndex((h) => h && h.includes(n));
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function loadProductsFromXLSX(): Promise<Product[]> {
  const response = await fetch("/data/RelatorioInventario.xlsx");
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  // Find header row
  let headerRowIdx = -1;
  let codeCol = -1, barcodeCol = -1, descCol = -1, unitCol = -1, qtyCol = -1, priceCol = -1;

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map((c: any) => String(c ?? ""));

    // Log first rows for debugging
    console.log(`Row ${i} (${cells.length} cells):`, cells.filter(c => c).join(" | "));

    const tryCode = findCol(cells, ["codigo", "cod"]);
    const tryDesc = findCol(cells, ["discriminacao", "descricao", "produto", "nome"]);
    const tryQty = findCol(cells, ["qtd", "quantidade", "estoque"]);
    // "unitario" must come before "unid" to avoid matching "Unid" column
    const tryPrice = findCol(cells, ["unitario", "valor unitario", "preco", "vl unit"]);

    if (tryCode !== -1 && tryDesc !== -1 && tryQty !== -1 && tryPrice !== -1) {
      headerRowIdx = i;
      codeCol = tryCode;
      descCol = tryDesc;
      qtyCol = tryQty;
      priceCol = tryPrice;
      barcodeCol = findCol(cells, ["barras", "ean", "barcode", "cod barras"]);
      unitCol = findCol(cells, ["unid", "unidade"]);
      console.log(`Header found at row ${i}:`, { codeCol, descCol, qtyCol, priceCol, barcodeCol, unitCol });
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.error("Could not find header row in XLSX. First 10 rows:", rows.slice(0, 10));
    return [];
  }

  const products: Product[] = [];
  let id = 1;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const code = String(row[codeCol] ?? "").trim();
    const description = String(row[descCol] ?? "").trim();

    if (!code || !description) continue;
    if (/resumo|tributac|total geral/i.test(code + description)) continue;

    const qtyVal = parseFloat(String(row[qtyCol] ?? ""));
    if (isNaN(qtyVal) || qtyVal <= 0) continue;

    const priceStr = String(row[priceCol] ?? "").trim();
    const priceCents = parseToCents(priceStr);
    if (priceCents <= 0) continue;

    const barcode = barcodeCol !== -1 ? String(row[barcodeCol] ?? "").trim() : "";
    const unit = unitCol !== -1 ? String(row[unitCol] ?? "").trim() : "UN";

    products.push({
      id: id++,
      code,
      barcode,
      description,
      unit,
      stock: Math.floor(qtyVal),
      unitPrice: priceCents,
    });
  }

  console.log(`Loaded ${products.length} products from XLSX`);
  return products;
}
