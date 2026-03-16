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

export async function loadProductsFromXLSX(): Promise<Product[]> {
  const response = await fetch("/data/RelatorioInventario.xlsx");
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const products: Product[] = [];
  let id = 1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 10) continue;

    const code = String(row[0] ?? "").trim();
    const description = String(row[3] ?? "").trim();
    const unit = String(row[7] ?? "").trim();
    const qtyRaw = row[8];
    const priceRaw = row[9];

    // Skip header rows, summary rows, and empty rows
    if (!code || !description || code === "Código") continue;
    if (description.includes("RESUMO") || description.includes("TRIBUTAÇÃO")) continue;

    const qty = parseFloat(String(qtyRaw));
    if (isNaN(qty) || qty <= 0) continue;

    // Parse price to cents WITHOUT floating-point multiplication
    const priceStr = String(priceRaw).trim();
    const priceCents = parseToCents(priceStr);
    if (priceCents <= 0) continue;

    const barcode = String(row[1] ?? "").trim();

    products.push({
      id: id++,
      code,
      barcode,
      description,
      unit,
      stock: Math.floor(qty),
      unitPrice: priceCents,
    });
  }

  return products;
}
