import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Bot, Play, Pause, Square, RotateCw, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/app/DatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatDateBR, todayIso } from "@/lib/time-slots";
import {
  api,
  fmtDur,
  fmtHoraSeg,
  type Evento,
  type Producao,
  type Sessao,
} from "@/lib/marcenaria";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/historico")({
  component: HistoricoPage,
});

type Ajuste = { id: string; sessao_id: string; tabela: string; acao: string; antes: unknown; depois: unknown; feito_em: string };

const TIPO = {
  start: { label: "START", icon: Play, cls: "text-success" },
  pausa: { label: "PAUSA", icon: Pause, cls: "text-warning" },
  retomar: { label: "RETOMAR", icon: RotateCw, cls: "text-success" },
  end: { label: "FIM", icon: Square, cls: "text-destructive" },
} as const;

function HistoricoPage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const [data, setData] = useState(todayIso());
  const [editEvento, setEditEvento] = useState<Evento | null>(null);
  const [editProd, setEditProd] = useState<Producao | null>(null);

  const q = useQuery({
    queryKey: ["historico", data],
    queryFn: async () => {
      const [sessoes, maquinas] = await Promise.all([api.sessoesDoDia(data), api.maquinas(true)]);
      const ids = sessoes.map((s) => s.id);
      const [eventos, producoes, ajustes] = await Promise.all([
        api.eventosDe(ids),
        api.producoesDe(ids),
        ids.length
          ? supabase
              .from("ajustes")
              .select("id, sessao_id, tabela, acao, antes, depois, feito_em")
              .in("sessao_id", ids)
              .order("feito_em", { ascending: false })
              .then(({ data, error }) => {
                if (error) throw new Error(error.message);
                return (data ?? []) as Ajuste[];
              })
          : Promise.resolve([] as Ajuste[]),
      ]);
      const nomes = Object.fromEntries(maquinas.map((m) => [m.id, m.nome])) as Record<string, string>;
      return { sessoes, eventos, producoes, ajustes, nomes };
    },
  });

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["historico", data] });
    void qc.invalidateQueries({ queryKey: ["painel"] });
  };

  const d = q.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker value={data} onChange={(v) => v && setData(v)} />
        <p className="pb-2 text-xs text-muted-foreground">
          {canEdit ? "Toque no lápis para corrigir um horário ou uma quantidade. Toda correção fica registrada." : "Somente consulta."}
        </p>
      </div>

      {q.isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Carregando…</div>
      ) : q.error ? (
        <div className="py-10 text-center text-destructive">Erro: {(q.error as Error).message}</div>
      ) : !d || d.sessoes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma sessão em {formatDateBR(data)}.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.sessoes.map((s) => (
            <SessaoCard
              key={s.id}
              s={s}
              nome={d.nomes[s.maquina_id] ?? "?"}
              eventos={d.eventos.filter((e) => e.sessao_id === s.id)}
              producoes={d.producoes.filter((p) => p.sessao_id === s.id)}
              ajustes={d.ajustes.filter((a) => a.sessao_id === s.id).length}
              canEdit={canEdit}
              onEditEvento={setEditEvento}
              onEditProd={setEditProd}
            />
          ))}
        </div>
      )}

      <EventoDialog
        evento={editEvento}
        onClose={() => setEditEvento(null)}
        onSaved={() => {
          setEditEvento(null);
          recarregar();
        }}
      />
      <ProducaoDialog
        producao={editProd}
        onClose={() => setEditProd(null)}
        onSaved={() => {
          setEditProd(null);
          recarregar();
        }}
      />
    </div>
  );
}

function SessaoCard({
  s,
  nome,
  eventos,
  producoes,
  ajustes,
  canEdit,
  onEditEvento,
  onEditProd,
}: {
  s: Sessao;
  nome: string;
  eventos: Evento[];
  producoes: Producao[];
  ajustes: number;
  canEdit: boolean;
  onEditEvento: (e: Evento) => void;
  onEditProd: (p: Producao) => void;
}) {
  const pecas = producoes.reduce((t, p) => t + p.quantidade, 0);
  const dur = ((s.encerrado_em ? Date.parse(s.encerrado_em) : Date.now()) - Date.parse(s.iniciado_em)) / 1000;

  // linha do tempo única: eventos e lançamentos de peças em ordem de horário
  const itens = [
    ...eventos.map((e) => ({ t: e.em, ev: e as Evento | null, pr: null as Producao | null })),
    ...producoes.map((p) => ({ t: p.lancado_em, ev: null as Evento | null, pr: p as Producao | null })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{nome}</CardTitle>
            <div className="text-xs text-muted-foreground">
              {fmtHoraSeg(s.iniciado_em)} até {s.encerrado_em ? fmtHoraSeg(s.encerrado_em) : "agora"} · {fmtDur(dur)} · {pecas} peças
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={s.status === "encerrada" ? "secondary" : "default"}>{s.status}</Badge>
            {s.fechado_auto && (
              <Badge variant="outline" className="border-warning/50 text-warning">
                <Bot className="mr-1 h-3 w-3" /> fechado automático
              </Badge>
            )}
            {ajustes > 0 && <span className="text-[10px] text-muted-foreground">{ajustes} correção(ões)</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {itens.map((it, k) => {
            if (it.ev) {
              const T = TIPO[it.ev.tipo];
              const Icon = T.icon;
              return (
                <li key={k} className="flex items-center gap-2 py-1.5">
                  <Icon className={cn("h-4 w-4 shrink-0", T.cls)} />
                  <span className="w-[72px] shrink-0 tabular-nums">{fmtHoraSeg(it.ev.em)}</span>
                  <span className={cn("shrink-0 text-xs font-bold", T.cls)}>{T.label}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {it.ev.observacao ?? ""}
                    {it.ev.planejada && " (planejada)"}
                  </span>
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditEvento(it.ev!)} title="Corrigir horário">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            }
            const p = it.pr!;
            return (
              <li key={k} className="flex items-center gap-2 py-1.5">
                <Package className="h-4 w-4 shrink-0 text-primary" />
                <span className="w-[72px] shrink-0 tabular-nums">{fmtHoraSeg(p.lancado_em)}</span>
                <span className="flex-1 font-medium">+{p.quantidade} peça{p.quantidade === 1 ? "" : "s"}</span>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditProd(p)} title="Corrigir quantidade">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function EventoDialog({ evento, onClose, onSaved }: { evento: Evento | null; onClose: () => void; onSaved: () => void }) {
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  // carrega os valores quando abre outro evento
  if (evento && aberto !== evento.id) {
    setAberto(evento.id);
    setHora(new Date(evento.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setMotivo(evento.observacao ?? "");
  }

  const salvar = async () => {
    if (!evento) return;
    const m = hora.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return toast.error("Horário inválido. Use HH:MM ou HH:MM:SS.");
    const d = new Date(evento.em);
    d.setHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0);
    setBusy(true);
    try {
      await api.ajustarEvento(evento.id, d.toISOString(), evento.tipo === "pausa" ? motivo : null);
      toast.success("Corrigido");
      setAberto(null);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!evento}
      onOpenChange={(o) => {
        if (!o) {
          setAberto(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Corrigir {evento ? TIPO[evento.tipo].label : ""}</DialogTitle>
          <DialogDescription>O horário precisa ficar entre o evento anterior e o próximo da mesma sessão.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="hora">Horário</Label>
            <Input id="hora" type="time" step={1} value={hora} onChange={(e) => setHora(e.target.value)} className="h-11" />
          </div>
          {evento?.tipo === "pausa" && (
            <div className="space-y-1">
              <Label htmlFor="motivo">Motivo</Label>
              <Textarea id="motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProducaoDialog({ producao, onClose, onSaved }: { producao: Producao | null; onClose: () => void; onSaved: () => void }) {
  const [valor, setValor] = useState("");
  const [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  if (producao && aberto !== producao.id) {
    setAberto(producao.id);
    setValor(String(producao.quantidade));
  }

  const q = Number(valor);
  const ok = Number.isInteger(q) && q >= 0 && q <= 100000;

  const salvar = async () => {
    if (!producao || !ok) return;
    setBusy(true);
    try {
      await api.ajustarProducao(producao.id, q);
      toast.success(q === 0 ? "Lançamento excluído" : "Corrigido");
      setAberto(null);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!producao}
      onOpenChange={(o) => {
        if (!o) {
          setAberto(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Corrigir quantidade</DialogTitle>
          <DialogDescription>Coloque 0 para excluir o lançamento.</DialogDescription>
        </DialogHeader>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="h-14 text-center text-2xl font-bold"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || !ok} variant={q === 0 ? "destructive" : "default"} onClick={salvar}>
            {q === 0 ? "Excluir" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
