import * as XLSX from "xlsx";

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
