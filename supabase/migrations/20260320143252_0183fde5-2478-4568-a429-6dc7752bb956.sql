
-- Products table
CREATE TABLE public.products (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  stock INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Debit history table
CREATE TABLE public.debit_history (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow public access (no auth required for this app)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read products" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public insert products" ON public.products FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow public update products" ON public.products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete products" ON public.products FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "Allow public read debit_history" ON public.debit_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public insert debit_history" ON public.debit_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow public delete debit_history" ON public.debit_history FOR DELETE TO anon, authenticated USING (true);
