import { useState, useCallback } from "react";
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
import { Package, Calculator, CheckCircle2, AlertTriangle, Boxes, DollarSign } from "lucide-react";

interface Product {
  id: number;
  code: string;
  description: string;
  stock: number;
  unitPrice: number; // stored as cents to avoid floating point
}

interface Suggestion {
  product: Product;
  qty: number;
}

const initialProducts: Product[] = [
  { id: 1, code: "COD-001", description: "Parafuso Sextavado M8", stock: 50, unitPrice: 550 },
  { id: 2, code: "COD-002", description: "Arruela Lisa 3/8", stock: 120, unitPrice: 180 },
  { id: 3, code: "COD-003", description: "Porca Autotravante M10", stock: 75, unitPrice: 320 },
  { id: 4, code: "COD-004", description: "Rebite Pop 4mm", stock: 200, unitPrice: 95 },
  { id: 5, code: "COD-005", description: "Chapa Aço Inox 1mm", stock: 30, unitPrice: 2450 },
  { id: 6, code: "COD-006", description: "Bucha Nylon S6", stock: 150, unitPrice: 45 },
  { id: 7, code: "COD-007", description: "Broca HSS 6mm", stock: 40, unitPrice: 1290 },
];

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Subset-sum via dynamic programming (values in cents).
 * Returns a combination that sums exactly to `target` or null.
 */
function findExactCombination(products: Product[], targetCents: number): Suggestion[] | null {
  // dp[v] = map of productId -> qty used to reach value v, or undefined
  const dp: (Map<number, number> | undefined)[] = new Array(targetCents + 1);
  dp[0] = new Map();

  for (const p of products) {
    // iterate in reverse per-product to allow multiple units (bounded knapsack)
    // We process one unit at a time up to stock limit
    for (let unit = 0; unit < p.stock; unit++) {
      for (let v = targetCents; v >= p.unitPrice; v--) {
        const prev = dp[v - p.unitPrice];
        if (prev !== undefined && dp[v] === undefined) {
          const next = new Map(prev);
          next.set(p.id, (next.get(p.id) || 0) + 1);
          // respect stock
          if ((next.get(p.id) || 0) <= p.stock) {
            dp[v] = next;
          }
        }
      }
    }
  }

  const result = dp[targetCents];
  if (!result) return null;

  const suggestions: Suggestion[] = [];
  for (const [pid, qty] of result.entries()) {
    const product = products.find((p) => p.id === pid)!;
    suggestions.push({ product, qty });
  }
  return suggestions;
}

const Index = () => {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [targetValue, setTargetValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const { toast } = useToast();

  const totalStockValue = products.reduce((s, p) => s + p.stock * p.unitPrice, 0);
  const totalItems = products.reduce((s, p) => s + p.stock, 0);

  const handleCalculate = useCallback(() => {
    const parsed = parseFloat(targetValue.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor alvo positivo.", variant: "destructive" });
      return;
    }
    const targetCents = Math.round(parsed * 100);

    setCalculating(true);
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const result = findExactCombination(products, targetCents);
      setCalculating(false);
      if (result) {
        setSuggestions(result);
        setDialogOpen(true);
      } else {
        toast({
          title: "Combinação não encontrada",
          description: "Não foi possível encontrar uma combinação exata para este valor.",
          variant: "destructive",
        });
      }
    }, 50);
  }, [targetValue, products, toast]);

  const handleConfirm = useCallback(() => {
    if (!suggestions) return;
    setProducts((prev) =>
      prev.map((p) => {
        const s = suggestions.find((sg) => sg.product.id === p.id);
        return s ? { ...p, stock: p.stock - s.qty } : p;
      })
    );
    setDialogOpen(false);
    setSuggestions(null);
    setTargetValue("");
    toast({ title: "Estoque atualizado!", description: "As quantidades foram debitadas com sucesso." });
  }, [suggestions, toast]);

  const suggestionTotal = suggestions?.reduce((s, sg) => s + sg.qty * sg.product.unitPrice, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Sistema de Separação</h1>
            <p className="text-sm text-muted-foreground">Separação inteligente de pedidos e débito de estoque</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Produtos Cadastrados</p>
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
                <p className="text-2xl font-bold text-foreground">{totalItems}</p>
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
        </div>

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
                {calculating ? "Calculando..." : "Calcular Sugestão Exata"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estoque Atual</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd. Estoque</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{p.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{p.description}</TableCell>
                    <TableCell className="text-right">
                      <span className={p.stock <= 10 ? "text-destructive font-semibold" : ""}>
                        {p.stock}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(p.unitPrice)}</TableCell>
                    <TableCell className="text-right font-mono">{formatBRL(p.stock * p.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

          <div className="space-y-3 my-2">
            {suggestions?.map((sg) => (
              <div key={sg.product.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium text-foreground">{sg.product.description}</p>
                  <p className="text-sm text-muted-foreground font-mono">{sg.product.code}</p>
                </div>
                <div className="text-right">
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
