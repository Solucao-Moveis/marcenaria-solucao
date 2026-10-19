import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Archive, ArchiveRestore, ArrowUp, ArrowDown, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/app/DatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatDateBR, todayIso } from "@/lib/time-slots";
import { api, type Maquina } from "@/lib/marcenaria";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/maquinas")({
  component: MaquinasPage,
});

function MaquinasPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [verArquivadas, setVerArquivadas] = useState(false);
  const maquinasQ = useQuery({ queryKey: ["maquinas", "todas"], queryFn: () => api.maquinas(true) });

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["maquinas"] });
    void qc.invalidateQueries({ queryKey: ["metas"] });
    void qc.invalidateQueries({ queryKey: ["painel"] });
  };

  const todas = maquinasQ.data ?? [];
  const ativas = todas.filter((m) => m.ativo);
  const lista = verArquivadas ? todas : ativas;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Máquinas</CardTitle>
            <CardDescription>
              A meta padrão vale para todo dia. Para um dia diferente, ajuste ao lado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEdit && <NovaMaquina proximaOrdem={(todas.at(-1)?.ordem ?? 0) + 1} onCreated={recarregar} />}

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={verArquivadas} onCheckedChange={setVerArquivadas} /> Mostrar arquivadas
            </label>

            {maquinasQ.isLoading ? (
              <div className="py-6 text-center text-muted-foreground">Carregando…</div>
            ) : lista.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma máquina cadastrada.</div>
            ) : (
              <ul className="divide-y rounded-lg border">
                {lista.map((m) => (
                  <MaquinaLinha
                    key={m.id}
                    m={m}
                    canEdit={canEdit}
                    vizinhos={ativas}
                    onChanged={recarregar}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <MetasDoDia maquinas={ativas} canEdit={canEdit} onChanged={recarregar} />
      </div>
    </div>
  );
}

function NovaMaquina({ proximaOrdem, onCreated }: { proximaOrdem: number; onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);

  const criar = async () => {
    const n = nome.trim();
    if (!n) return toast.error("Informe o nome da máquina");
    setBusy(true);
    const { error } = await supabase
      .from("maquinas")
      .insert({ nome: n, meta_padrao: Math.max(0, Number(meta) || 0), ordem: proximaOrdem });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${n} cadastrada`);
    setNome("");
    setMeta("");
    onCreated();
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/50 p-3">
      <div className="min-w-[160px] flex-1 space-y-1">
        <Label htmlFor="nova">Nova máquina</Label>
        <Input id="nova" placeholder="Ex.: Serra esquadrejadeira" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
      </div>
      <div className="w-[120px] space-y-1">
        <Label htmlFor="meta-nova">Meta padrão/dia</Label>
        <Input id="meta-nova" type="number" inputMode="numeric" min={0} placeholder="0" value={meta} onChange={(e) => setMeta(e.target.value)} />
      </div>
      <Button onClick={criar} disabled={busy}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
    </div>
  );
}

function MaquinaLinha({
  m,
  canEdit,
  vizinhos,
  onChanged,
}: {
  m: Maquina;
  canEdit: boolean;
  vizinhos: Maquina[];
  onChanged: () => void;
}) {
  const [nome, setNome] = useState(m.nome);
  const [meta, setMeta] = useState(String(m.meta_padrao));
  const mudou = nome.trim() !== m.nome || Number(meta) !== m.meta_padrao;

  const salvar = async () => {
    if (!nome.trim()) return toast.error("Nome vazio");
    const { error } = await supabase
      .from("maquinas")
      .update({ nome: nome.trim(), meta_padrao: Math.max(0, Number(meta) || 0) })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    onChanged();
  };

  const arquivar = async () => {
    const { error } = await supabase.from("maquinas").update({ ativo: !m.ativo }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(m.ativo ? `${m.nome} arquivada` : `${m.nome} restaurada`);
    onChanged();
  };

  // troca a ordem com a vizinha (lista renumerada 1..n pra não empatar)
  const mover = async (dir: -1 | 1) => {
    const idx = vizinhos.findIndex((x) => x.id === m.id);
    const alvo = idx + dir;
    if (idx < 0 || alvo < 0 || alvo >= vizinhos.length) return;
    const nova = [...vizinhos];
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    const results = await Promise.all(
      nova.map((x, i) => supabase.from("maquinas").update({ ordem: i + 1 }).eq("id", x.id)),
    );
    const err = results.find((r) => r.error)?.error;
    if (err) toast.error(err.message);
    onChanged();
  };

  if (!canEdit) {
    return (
      <li className={cn("flex items-center justify-between px-3 py-2 text-sm", !m.ativo && "opacity-60")}>
        <span className="font-medium">{m.nome}</span>
        <span className="text-muted-foreground">meta {m.meta_padrao}/dia</span>
      </li>
    );
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !m.ativo && "bg-muted/40")}>
      <div className="flex flex-col">
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => mover(-1)} disabled={!m.ativo} aria-label="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => mover(1)} disabled={!m.ativo} aria-label="Descer">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 min-w-[140px] flex-1" />
      <div className="flex items-center gap-1">
        <Input type="number" inputMode="numeric" min={0} value={meta} onChange={(e) => setMeta(e.target.value)} className="h-9 w-[84px]" aria-label="Meta padrão" />
        <span className="text-xs text-muted-foreground">/dia</span>
      </div>
      {mudou && (
        <Button size="sm" onClick={salvar}><Save className="mr-1 h-3.5 w-3.5" /> Salvar</Button>
      )}
      {!m.ativo && <Badge variant="secondary">arquivada</Badge>}
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={arquivar} title={m.ativo ? "Arquivar" : "Restaurar"}>
        {m.ativo ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
      </Button>
    </li>
  );
}

function MetasDoDia({ maquinas, canEdit, onChanged }: { maquinas: Maquina[]; canEdit: boolean; onChanged: () => void }) {
  const [data, setData] = useState(todayIso());
  const metasQ = useQuery({ queryKey: ["metas", data], queryFn: () => api.metas(data) });
  const [valores, setValores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null);

  // preenche os campos quando as metas do dia chegam (ou troca a data)
  if (metasQ.data && carregadoPara !== `${data}|${metasQ.dataUpdatedAt}`) {
    setCarregadoPara(`${data}|${metasQ.dataUpdatedAt}`);
    setValores(Object.fromEntries(metasQ.data.map((x) => [x.maquina_id, String(x.meta_pecas)])));
  }

  const salvar = async () => {
    setBusy(true);
    try {
      const existentes = new Map((metasQ.data ?? []).map((x) => [x.maquina_id, x]));
      for (const m of maquinas) {
        const v = (valores[m.id] ?? "").trim();
        const atual = existentes.get(m.id);
        if (v === "") {
          // vazio = volta a usar a meta padrão
          if (atual) {
            const { error } = await supabase.from("metas").delete().eq("id", atual.id);
            if (error) throw error;
          }
          continue;
        }
        const n = Math.max(0, Math.round(Number(v)));
        if (!Number.isFinite(n)) continue;
        if (atual?.meta_pecas === n) continue;
        const { error } = await supabase
          .from("metas")
          .upsert({ maquina_id: m.id, data, meta_pecas: n }, { onConflict: "maquina_id,data" });
        if (error) throw error;
      }
      toast.success(`Metas de ${formatDateBR(data)} salvas`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meta de um dia específico</CardTitle>
        <CardDescription>Deixe em branco para usar a meta padrão da máquina.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DatePicker value={data} onChange={(v) => v && setData(v)} />
        {maquinas.length === 0 ? (
          <div className="text-sm text-muted-foreground">Cadastre as máquinas primeiro.</div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {maquinas.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm font-medium">{m.nome}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={!canEdit}
                  placeholder={`padrão ${m.meta_padrao}`}
                  value={valores[m.id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [m.id]: e.target.value }))}
                  className="h-9 w-[130px]"
                />
              </li>
            ))}
          </ul>
        )}
        {canEdit && maquinas.length > 0 && (
          <Button onClick={salvar} disabled={busy || metasQ.isLoading}>
            <Save className="mr-1 h-4 w-4" /> Salvar metas do dia
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
