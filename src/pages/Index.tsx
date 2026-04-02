import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Package, Calculator, CheckCircle2, Boxes, DollarSign, Search, Loader2, ChevronLeft, ChevronRight, Upload, Pencil, RotateCcw, Minus } from "lucide-react";
import { type Product } from "@/lib/loadProducts";
import { useProducts } from "@/hooks/useProducts";

interface Suggestion {
  product: Product;
  qty: number;
}

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAGE_SIZE = 20;

function findExactCombination(products: Product[], targetCents: number): Suggestion[] | null {
  const eligible = products
    .filter((p) => p.unitPrice <= targetCents && p.stock > 0)
    .sort((a, b) => b.unitPrice - a.unitPrice);

  const result: Suggestion[] = [];
  let found = false;
  const deadline = Date.now() + 5000;

  function backtrack(idx: number, remaining: number) {
    if (found) return;
    if (remaining === 0) { found = true; return; }
    if (idx >= eligible.length || Date.now() > deadline) return;
    if (eligible[eligible.length - 1].unitPrice > remaining) return;

    for (let i = idx; i < eligible.length && !found; i++) {
      const p = eligible[i];
      if (p.unitPrice > remaining) continue;
      const maxQty = Math.min(p.stock, Math.floor(remaining / p.unitPrice));
      for (let q = 1; q <= maxQty && !found; q++) {
        result.push({ product: p, qty: q });
        backtrack(i + 1, remaining - q * p.unitPrice);
        if (!found) result.pop();
      }
    }
  }

  backtrack(0, targetCents);
  return found ? [...result] : null;
}

const Index = () => {
  const {
    products,
    debitHistory,
    loading,
    updateProductStock,
    updateProductPrice,
    debitProducts,
    resetDebitHistory,
    uploadFile,
  } = useProducts();

  const [targetValue, setTargetValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [priceSearch, setPriceSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [page, setPage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: "stock" | "price" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  const filteredProducts = useMemo(() => {
    let list = products;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.code.toLowerCase().includes(lower) ||
          p.description.toLowerCase().includes(lower) ||
          p.barcode.includes(lower)
      );
    }
    if (priceSearch) {
      const searchCents = Math.round(parseFloat(priceSearch.replace(",", ".")) * 100);
      if (!isNaN(searchCents) && searchCents > 0) {
        list = list.filter((p) => p.unitPrice === searchCents);
      }
    }
    return list;
  }, [products, searchTerm, priceSearch]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const pagedProducts = filteredProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalStockValue = products.reduce((s, p) => s + p.stock * p.unitPrice, 0);
  const totalItems = products.reduce((s, p) => s + p.stock, 0);

  const handleCalculate = useCallback(() => {
    if (calculating) return;
    const parsed = parseFloat(targetValue.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor alvo positivo.", variant: "destructive" });
      return;
    }
    const targetCents = Math.round(parsed * 100);

    if (dialogOpen) {
      setDialogOpen(false);
      setSuggestions(null);
    }

    setCalculating(true);
    const snapshot = [...products];

    setTimeout(() => {
      try {
        const result = findExactCombination(snapshot, targetCents);
        setCalculating(false);
        if (result) {
          setSuggestions(result);
          requestAnimationFrame(() => setDialogOpen(true));
        } else {
          setSuggestions(null);
          toast({
            title: "Combinação não encontrada",
            description: "Não foi possível encontrar uma combinação exata para este valor.",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Calculation error:", err);
        setCalculating(false);
        toast({
          title: "Erro no cálculo",
          description: "Ocorreu um erro durante o cálculo. Tente novamente.",
          variant: "destructive",
        });
      }
    }, 100);
  }, [targetValue, products, toast, calculating, dialogOpen]);

  const handleConfirm = useCallback(async () => {
    if (!suggestions || suggestions.length === 0) return;

    const debits = suggestions.map((sg) => ({
      productId: sg.product.id,
      qty: sg.qty,
      code: sg.product.code,
      description: sg.product.description,
      unitPriceCents: sg.product.unitPrice,
    }));

    await debitProducts(debits);

    setDialogOpen(false);
    setSuggestions(null);
    setTargetValue("");
    toast({ title: "Estoque atualizado!", description: "As quantidades foram debitadas com sucesso." });
  }, [suggestions, toast, debitProducts]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({ title: "Formato inválido", description: "Envie um arquivo .xlsx ou .xls", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await uploadFile(buffer);
      if (result.count === 0) {
        toast({ title: "Nenhum produto encontrado", description: "Verifique se o arquivo segue o formato esperado.", variant: "destructive" });
      } else {
        setPage(0);
        setSearchTerm("");
        toast({ title: "Estoque atualizado!", description: `${result.count} produtos carregados do novo arquivo.` });
      }
    } catch (err) {
      toast({ title: "Erro ao processar arquivo", description: String(err), variant: "destructive" });
    }
    setUploading(false);
    e.target.value = "";
  }, [toast, uploadFile]);

  const handleEditStock = useCallback((productId: number, newStock: number) => {
    if (isNaN(newStock) || newStock < 0) return;
    updateProductStock(productId, newStock);
  }, [updateProductStock]);

  const handleEditPrice = useCallback((productId: number, newPrice: number) => {
    if (isNaN(newPrice) || newPrice < 0) return;
    updateProductPrice(productId, Math.round(newPrice * 100));
  }, [updateProductPrice]);

  const startEdit = (id: number, field: "stock" | "price", currentValue: number) => {
    setEditingCell({ id, field });
    setEditValue(field === "price" ? (currentValue / 100).toFixed(2).replace(".", ",") : String(currentValue));
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const val = parseFloat(editValue.replace(",", "."));
    if (editingCell.field === "stock") {
      handleEditStock(editingCell.id, Math.floor(val));
    } else {
      handleEditPrice(editingCell.id, val);
    }
    setEditingCell(null);
  };

  const handleResetDebitSum = async () => {
    await resetDebitHistory();
    toast({ title: "Soma zerada!", description: "O total de débitos do dia foi reiniciado." });
  };

  const debitTotalCents = debitHistory.reduce((s, e) => s + e.qty * e.unitPriceCents, 0);
  const suggestionTotal = suggestions?.reduce((s, sg) => s + sg.qty * sg.product.unitPrice, 0) || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Carregando inventário...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Sistema de Separação</h1>
              <p className="text-sm text-muted-foreground">
                Separação inteligente de pedidos • {products.length} produtos carregados
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleResetDebitSum}
              disabled={debitHistory.length === 0}
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar Soma
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls"
              id="xlsx-upload"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={uploading}
              onClick={() => document.getElementById("xlsx-upload")?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Processando..." : "Atualizar Estoque"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Produtos</p>
                <p className="text-2xl font-bold text-foreground">{products.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/10">
                <Boxes className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Itens</p>
                <p className="text-2xl font-bold text-foreground">{totalItems.toLocaleString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor em Estoque</p>
                <p className="text-2xl font-bold text-foreground">{formatBRL(totalStockValue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={debitHistory.length > 0 ? "border-2 border-destructive/30" : ""}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-destructive/10">
                <Minus className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Debitado</p>
                <p className="text-2xl font-bold text-destructive">{formatBRL(debitTotalCents)}</p>
                <p className="text-xs text-muted-foreground">{debitHistory.length} item(ns)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debit History */}
        {debitHistory.length > 0 && (
          <Card className="border border-destructive/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Minus className="h-4 w-4 text-destructive" />
                Histórico de Débitos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {debitHistory.map((entry, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span className="font-mono text-foreground">{entry.code}</span>
                    <span className="text-muted-foreground truncate max-w-[200px] mx-2">{entry.description}</span>
                    <span className="shrink-0 font-medium text-foreground">{entry.qty}x {formatBRL(entry.unitPriceCents)} = <span className="text-destructive">{formatBRL(entry.qty * entry.unitPriceCents)}</span></span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 mt-2 border-t font-bold text-foreground">
                <span>Total Debitado</span>
                <span className="font-mono text-destructive">{formatBRL(debitTotalCents)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Target Value Input */}
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-5 w-5 text-primary" />
              Calcular Combinação
            </CardTitle>
            <CardDescription>
              Informe o valor alvo e encontre a combinação exata de produtos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">R$</span>
                <Input
                  className="pl-10 text-lg h-12 font-mono"
                  placeholder="0,00"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
                />
              </div>
              <Button
                size="lg"
                className="h-12 px-8"
                onClick={handleCalculate}
                disabled={calculating}
              >
                {calculating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  "Calcular Sugestão Exata"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-lg">Estoque Atual</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por código, descrição..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-32 h-8 text-sm font-mono"
                  placeholder="Buscar por valor"
                  value={priceSearch}
                  onChange={(e) => { setPriceSearch(e.target.value); setPage(0); }}
                />
                {priceSearch && (
                  <Button variant="ghost" size="sm" onClick={() => setPriceSearch("")}>
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Unid.</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{p.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[300px] truncate">{p.description}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                    <TableCell className="text-right">
                      {editingCell?.id === p.id && editingCell.field === "stock" ? (
                        <Input
                          className="w-20 ml-auto text-right h-8 text-sm font-mono"
                          value={editValue}
                          autoFocus
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:underline ${p.stock <= 5 ? "text-destructive font-semibold" : ""}`}
                          onClick={() => startEdit(p.id, "stock", p.stock)}
                          title="Clique para editar"
                        >
                          {p.stock} <Pencil className="inline h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingCell?.id === p.id && editingCell.field === "price" ? (
                        <Input
                          className="w-24 ml-auto text-right h-8 text-sm font-mono"
                          value={editValue}
                          autoFocus
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:underline font-mono text-sm"
                          onClick={() => startEdit(p.id, "price", p.unitPrice)}
                          title="Clique para editar"
                        >
                          {formatBRL(p.unitPrice)} <Pencil className="inline h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatBRL(p.stock * p.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {filteredProducts.length} produto(s) • Página {page + 1} de {totalPages || 1}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Results Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              Sugestão Encontrada
            </DialogTitle>
            <DialogDescription>
              Combinação exata para o valor de {formatBRL(suggestionTotal)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 max-h-[400px] overflow-y-auto">
            {suggestions?.map((sg) => (
              <div key={sg.product.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="font-bold text-foreground text-base font-mono">{sg.product.code}</p>
                  <p className="text-xs text-muted-foreground truncate">{sg.product.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">{sg.qty}x</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {formatBRL(sg.qty * sg.product.unitPrice)}
                  </p>
                </div>
              </div>
            ))}

            <div className="flex justify-between items-center pt-3 border-t font-bold text-foreground">
              <span>Total</span>
              <span className="font-mono">{formatBRL(suggestionTotal)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirm} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Confirmar e Baixar Estoque
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
