import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Product, parseProductsFromBuffer } from "@/lib/loadProducts";

export interface DebitEntry {
  id?: number;
  code: string;
  description: string;
  qty: number;
  unitPriceCents: number;
  created_at?: string;
}

function dbToProduct(row: any): Product {
  return {
    id: row.id,
    code: row.code,
    barcode: row.barcode || "",
    description: row.description,
    unit: row.unit || "UN",
    stock: row.stock,
    unitPrice: row.unit_price,
  };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [debitHistory, setDebitHistory] = useState<DebitEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load products from DB
  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: true });
    if (error) {
      console.error("Error loading products:", error);
      return [];
    }
    const mapped = (data || []).map(dbToProduct);
    setProducts(mapped);
    return mapped;
  }, []);

  // Load debit history from DB
  const loadDebitHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("debit_history")
      .select("*")
      .order("id", { ascending: true });
    if (error) {
      console.error("Error loading debit history:", error);
      return;
    }
    setDebitHistory(
      (data || []).map((d: any) => ({
        id: d.id,
        code: d.code,
        description: d.description,
        qty: d.qty,
        unitPriceCents: d.unit_price_cents,
        created_at: d.created_at,
      }))
    );
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([loadProducts(), loadDebitHistory()]).then(([prods]) => {
      // If DB is empty, try migrating from localStorage
      if (prods.length === 0) {
        const saved = localStorage.getItem("sep_products");
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Product[];
            if (parsed.length > 0) {
              importProducts(parsed).then(() => {
                // Also migrate debit history
                const savedDebit = localStorage.getItem("sep_debitHistory");
                if (savedDebit) {
                  try {
                    const parsedDebit = JSON.parse(savedDebit) as DebitEntry[];
                    if (parsedDebit.length > 0) {
                      importDebitEntries(parsedDebit);
                    }
                  } catch {}
                }
              });
            }
          } catch {}
        }
      }
      setLoading(false);
    });
  }, []);

  // Import products array into DB (replaces all)
  const importProducts = useCallback(async (newProducts: Product[]) => {
    // Delete existing
    await supabase.from("products").delete().gte("id", 0);

    // Insert in batches of 500
    const rows = newProducts.map((p) => ({
      code: p.code,
      barcode: p.barcode,
      description: p.description,
      unit: p.unit,
      stock: p.stock,
      unit_price: p.unitPrice,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from("products").insert(batch);
      if (error) console.error("Insert error:", error);
    }

    await loadProducts();
  }, [loadProducts]);

  // Import debit entries
  const importDebitEntries = useCallback(async (entries: DebitEntry[]) => {
    const rows = entries.map((e) => ({
      code: e.code,
      description: e.description,
      qty: e.qty,
      unit_price_cents: e.unitPriceCents,
    }));
    await supabase.from("debit_history").insert(rows);
    await loadDebitHistory();
  }, [loadDebitHistory]);

  // Update single product stock
  const updateProductStock = useCallback(async (productId: number, newStock: number) => {
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, stock: newStock } : p));
    await supabase.from("products").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", productId);
  }, []);

  // Update single product price
  const updateProductPrice = useCallback(async (productId: number, newPriceCents: number) => {
    setProducts((prev) => prev.map((p) => p.id === productId ? { ...p, unitPrice: newPriceCents } : p));
    await supabase.from("products").update({ unit_price: newPriceCents, updated_at: new Date().toISOString() }).eq("id", productId);
  }, []);

  // Debit stock for multiple products + add to debit history
  const debitProducts = useCallback(async (debits: { productId: number; qty: number; code: string; description: string; unitPriceCents: number }[]) => {
    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => {
        const entry = debits.find((d) => d.productId === p.id);
        if (!entry) return p;
        return { ...p, stock: Math.max(0, p.stock - entry.qty) };
      })
    );

    // Update DB
    for (const d of debits) {
      const product = products.find((p) => p.id === d.productId);
      if (!product) continue;
      const newStock = Math.max(0, product.stock - d.qty);
      await supabase.from("products").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", d.productId);
    }

    // Add debit history entries
    const historyRows = debits.map((d) => ({
      code: d.code,
      description: d.description,
      qty: d.qty,
      unit_price_cents: d.unitPriceCents,
    }));
    await supabase.from("debit_history").insert(historyRows);

    const newEntries: DebitEntry[] = debits.map((d) => ({
      code: d.code,
      description: d.description,
      qty: d.qty,
      unitPriceCents: d.unitPriceCents,
    }));
    setDebitHistory((prev) => [...prev, ...newEntries]);
  }, [products]);

  // Reset debit history
  const resetDebitHistory = useCallback(async () => {
    await supabase.from("debit_history").delete().gte("id", 0);
    setDebitHistory([]);
  }, []);

  // Upload new XLSX file
  const uploadFile = useCallback(async (buffer: ArrayBuffer) => {
    const newProducts = parseProductsFromBuffer(buffer);
    if (newProducts.length === 0) return { count: 0 };
    await importProducts(newProducts);
    await resetDebitHistory();
    return { count: newProducts.length };
  }, [importProducts, resetDebitHistory]);

  return {
    products,
    debitHistory,
    loading,
    updateProductStock,
    updateProductPrice,
    debitProducts,
    resetDebitHistory,
    uploadFile,
    importProducts,
  };
}
