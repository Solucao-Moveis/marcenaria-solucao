import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Play, Pause, Square, Undo2, Plus, Coffee, AlertTriangle, PowerOff, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useMarcenariaRealtime, useTick } from "@/lib/use-realtime";
import { formatDateBR } from "@/lib/time-slots";
import {
  api,
  fmtDur,
  fmtHora,
  fmtRelogio,
  metaEsperadaAgora,
  MOTIVOS_RAPIDOS,
  pecasPorHora,
  type Painel,
  type PainelMaquina,
} from "@/lib/marcenaria";

export const Route = createFileRoute("/_app/")({
  component: ControlePage,
});

const PAINEL_KEY = ["painel"];

type Acao =
  | { tipo: "pausa"; m: PainelMaquina }
  | { tipo: "encerrar"; m: PainelMaquina }
  | { tipo: "qtd"; m: PainelMaquina }
  | { tipo: "encerrar-todas" };

function ControlePage() {
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const now = useTick(1000);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [acao, setAcao] = useState<Acao | null>(null);

  const painelQ = useQuery({
    queryKey: PAINEL_KEY,
    queryFn: api.painel,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  useMarcenariaRealtime([PAINEL_KEY]);

  // segundos desde que o banco calculou os tempos (o banco já conta até o "agora" dele;
  // somando o tempo decorrido no aparelho, o relógio do celular não interfere)
  const decorrido = painelQ.dataUpdatedAt ? Math.max(0, (now - painelQ.dataUpdatedAt) / 1000) : 0;

  const run = async (chave: string, fn: () => Promise<unknown>, ok?: string) => {
    if (busy[chave]) return;
    setBusy((b) => ({ ...b, [chave]: true }));
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy((b) => ({ ...b, [chave]: false }));
      void qc.invalidateQueries({ queryKey: PAINEL_KEY });
    }
  };

  // +peças aparece na hora; o banco confirma em seguida
  const lancar = (m: PainelMaquina, qtd: number) => {
    if (!m.sessao) return;
    const sessao = m.sessao.id;
    qc.setQueryData<Painel>(PAINEL_KEY, (p) =>
      p && {
        ...p,
        maquinas: p.maquinas.map((x) =>
          x.id === m.id && x.sessao
            ? { ...x, pecas: x.pecas + qtd, sessao: { ...x.sessao, ultimo_lancamento: qtd } }
            : x,
        ),
      },
    );
    // sem trava de clique duplo: cada toque é um lançamento (o +1 +1 +1 tem que valer)
    api
      .lancarPecas(sessao, qtd)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => void qc.invalidateQueries({ queryKey: PAINEL_KEY }));
  };

  if (painelQ.isLoading) {
    return <div className="py-16 text-center text-muted-foreground">Carregando máquinas…</div>;
  }
  if (painelQ.error) {
    return (
      <div className="py-16 text-center text-destructive">
        Erro ao carregar: {(painelQ.error as Error).message}
      </div>
    );
  }

  const painel = painelQ.data!;
  const maquinas = painel.maquinas;
  const rodando = maquinas.filter((m) => m.sessao?.status === "rodando").length;
  const pausadas = maquinas.filter((m) => m.sessao?.status === "pausada").length;
  const abertas = rodando + pausadas;
  const pecasTotal = maquinas.reduce((s, m) => s + m.pecas, 0);
  const metaTotal = maquinas.reduce((s, m) => s + m.meta, 0);

  return (
    <div className="space-y-4">
      {/* Resumo do dia */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Hoje</div>
          <div className="text-lg font-semibold">{formatDateBR(painel.data)}</div>
        </div>
        <Badge className="bg-success text-success-foreground">{rodando} rodando</Badge>
        <Badge className="bg-warning text-warning-foreground">{pausadas} pausada{pausadas === 1 ? "" : "s"}</Badge>
        <Badge variant="secondary">
          {pecasTotal} peças{metaTotal > 0 ? ` / meta ${metaTotal}` : ""}
        </Badge>
        {canEdit && abertas > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAcao({ tipo: "encerrar-todas" })}>
            <PowerOff className="mr-1 h-4 w-4" /> Encerrar tudo
          </Button>
        )}
      </div>

      {maquinas.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <p className="text-muted-foreground">Nenhuma máquina cadastrada ainda.</p>
            {canEdit && (
              <Button asChild>
                <Link to="/maquinas"><Settings2 className="mr-2 h-4 w-4" /> Cadastrar máquinas</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {maquinas.map((m) => (
            <MaquinaCard
              key={m.id}
              m={m}
              decorrido={decorrido}
              servidorAgora={painel.agora}
              data={painel.data}
              canEdit={canEdit}
              busy={!!busy[m.id]}
              onStart={() => run(m.id, () => api.iniciar(m.id), `${m.nome}: iniciada`)}
              onPausa={() => setAcao({ tipo: "pausa", m })}
              onRetomar={() => m.sessao && run(m.id, () => api.retomar(m.sessao!.id), `${m.nome}: retomada`)}
              onEncerrar={() => setAcao({ tipo: "encerrar", m })}
              onPecas={(q) => lancar(m, q)}
              onPecasN={() => setAcao({ tipo: "qtd", m })}
              onDesfazer={() =>
                m.sessao &&
                run(m.id, async () => {
                  const q = await api.desfazer(m.sessao!.id);
                  toast.success(`Desfeito: −${q} peça${q === 1 ? "" : "s"}`);
                })
              }
            />
          ))}
        </div>
      )}

      <PausaDialog
        m={acao?.tipo === "pausa" ? acao.m : null}
        onClose={() => setAcao(null)}
        onConfirm={(motivo, planejada) => {
          const m = (acao as { m: PainelMaquina }).m;
          setAcao(null);
          void run(m.id, () => api.pausar(m.sessao!.id, motivo, planejada), `${m.nome}: pausada`);
        }}
      />

      <QtdDialog
        m={acao?.tipo === "qtd" ? acao.m : null}
        onClose={() => setAcao(null)}
        onConfirm={(q) => {
          const m = (acao as { m: PainelMaquina }).m;
          setAcao(null);
          lancar(m, q);
        }}
      />

      <AlertDialog open={acao?.tipo === "encerrar" || acao?.tipo === "encerrar-todas"} onOpenChange={(o) => !o && setAcao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao?.tipo === "encerrar" ? `Encerrar ${acao.m.nome}?` : `Encerrar ${abertas} máquina${abertas === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              O cronômetro para e a sessão fecha. Se a máquina voltar a trabalhar hoje, é só dar START de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (acao?.tipo === "encerrar") {
                  const m = acao.m;
                  void run(m.id, () => api.encerrar(m.sessao!.id), `${m.nome}: encerrada`);
                } else {
                  void run("todas", async () => {
                    const n = await api.encerrarTodas();
                    toast.success(`${n} máquina${n === 1 ? "" : "s"} encerrada${n === 1 ? "" : "s"}`);
                  });
                }
                setAcao(null);
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MaquinaCard({
  m,
  decorrido,
  servidorAgora,
  data,
  canEdit,
  busy,
  onStart,
  onPausa,
  onRetomar,
  onEncerrar,
  onPecas,
  onPecasN,
  onDesfazer,
}: {
  m: PainelMaquina;
  decorrido: number;
  servidorAgora: string;
  data: string;
  canEdit: boolean;
  busy: boolean;
  onStart: () => void;
  onPausa: () => void;
  onRetomar: () => void;
  onEncerrar: () => void;
  onPecas: (q: number) => void;
  onPecasN: () => void;
  onDesfazer: () => void;
}) {
  const s = m.sessao;
  const status = s?.status ?? (m.sessoes_dia > 0 ? "encerrada" : "parada");
  const planejada = status === "pausada" && !!s?.planejada;

  const produtivo = m.produtivo_seg + (status === "rodando" ? decorrido : 0);
  const parado = m.parado_seg + (status === "pausada" && !planejada ? decorrido : 0);
  const etapa = s ? (Date.parse(servidorAgora) - Date.parse(s.ultimo_evento_em)) / 1000 + decorrido : 0;

  const ritmo = pecasPorHora(m.pecas, produtivo);
  const agoraEstimado = new Date(Date.parse(servidorAgora) + decorrido * 1000);
  const esperado = metaEsperadaAgora(m.meta, data, agoraEstimado);
  const progresso = m.meta > 0 ? Math.min(100, (m.pecas / m.meta) * 100) : 0;
  const marcador = m.meta > 0 ? Math.min(100, (esperado / m.meta) * 100) : 0;
  const atrasado = m.meta > 0 && m.pecas < esperado;

  const tom = {
    rodando: { borda: "border-l-success", badge: "bg-success text-success-foreground", texto: "Rodando" },
    pausada: planejada
      ? { borda: "border-l-muted-foreground", badge: "bg-secondary text-secondary-foreground", texto: "Pausa planejada" }
      : { borda: "border-l-warning", badge: "bg-warning text-warning-foreground", texto: "Parada" },
    encerrada: { borda: "border-l-border", badge: "bg-muted text-muted-foreground", texto: "Encerrada" },
    parada: { borda: "border-l-border", badge: "bg-muted text-muted-foreground", texto: "Não iniciada" },
  }[status];

  return (
    <Card className={cn("border-l-4 transition-shadow", tom.borda, status === "rodando" && "shadow-md")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{m.nome}</div>
            <div className="text-xs text-muted-foreground">
              {s ? `Início ${fmtHora(s.iniciado_em)}` : m.sessoes_dia > 0 ? `${m.sessoes_dia} sessão(ões) hoje` : "Sem lançamento hoje"}
            </div>
          </div>
          <Badge className={cn("shrink-0", tom.badge)}>
            {status === "rodando" && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />}
            {planejada && <Coffee className="mr-1 h-3 w-3" />}
            {status === "pausada" && !planejada && <AlertTriangle className="mr-1 h-3 w-3" />}
            {tom.texto}
          </Badge>
        </div>

        {/* cronômetro: tempo rodando no dia */}
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tempo rodando hoje</div>
          <div
            className={cn(
              "font-mono text-4xl font-bold tabular-nums tracking-tight",
              status === "rodando" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {fmtRelogio(produtivo)}
          </div>
          <div className="min-h-[1.25rem] text-xs">
            {status === "rodando" && <span className="text-success">Nesta etapa: {fmtRelogio(etapa)}</span>}
            {status === "pausada" && (
              <span className={planejada ? "text-muted-foreground" : "text-warning"}>
                Parada há {fmtRelogio(etapa)}
                {s?.motivo ? ` · ${s.motivo}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* números */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-2xl font-bold tabular-nums">{m.pecas}</div>
            <div className="text-[10px] uppercase text-muted-foreground">peças</div>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <div className="text-2xl font-bold tabular-nums">{ritmo == null ? "-" : ritmo.toFixed(1)}</div>
            <div className="text-[10px] uppercase text-muted-foreground">peças/h</div>
          </div>
          <div className="rounded-lg bg-muted/60 p-2">
            <div className={cn("text-2xl font-bold tabular-nums", parado > 0 && "text-warning")}>{fmtDur(parado)}</div>
            <div className="text-[10px] uppercase text-muted-foreground">parado</div>
          </div>
        </div>

        {/* meta */}
        {m.meta > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Meta do dia: {m.meta}</span>
              <span className={cn("font-semibold", atrasado ? "text-destructive" : "text-success")}>
                {Math.round((m.pecas / m.meta) * 100)}% {atrasado ? `· esperado agora ${esperado}` : ""}
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" title={`Esperado agora: ${esperado} peças`}>
              <div
                className={cn("h-full rounded-full transition-all", atrasado ? "bg-destructive" : "bg-success")}
                style={{ width: `${progresso}%` }}
              />
              {marcador > 0 && marcador < 100 && (
                <div className="absolute top-0 h-full w-0.5 bg-foreground/70" style={{ left: `${marcador}%` }} />
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Sem meta definida para hoje</div>
        )}

        {/* botões */}
        {canEdit && (
          <div className="space-y-2 pt-1">
            {status === "rodando" && (
              <div className="grid grid-cols-5 gap-1.5">
                <Button variant="secondary" className="h-12 text-base font-bold" onClick={() => onPecas(1)}>
                  +1
                </Button>
                <Button variant="secondary" className="h-12 text-base font-bold" onClick={() => onPecas(5)}>
                  +5
                </Button>
                <Button variant="secondary" className="h-12 text-base font-bold" onClick={() => onPecas(10)}>
                  +10
                </Button>
                <Button variant="secondary" className="h-12" onClick={onPecasN} title="Outra quantidade">
                  <Plus className="h-4 w-4" />N
                </Button>
                <Button
                  variant="ghost"
                  className="h-12"
                  disabled={!s?.ultimo_lancamento}
                  onClick={onDesfazer}
                  title={s?.ultimo_lancamento ? `Desfazer último lançamento (${s.ultimo_lancamento})` : "Nada para desfazer"}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              {(status === "parada" || status === "encerrada") && (
                <Button className="h-14 flex-1 bg-success text-lg font-bold text-success-foreground hover:bg-success/90" disabled={busy} onClick={onStart}>
                  <Play className="mr-2 h-5 w-5" /> {status === "encerrada" ? "START de novo" : "START"}
                </Button>
              )}
              {status === "rodando" && (
                <Button className="h-14 flex-1 bg-warning text-lg font-bold text-warning-foreground hover:bg-warning/90" disabled={busy} onClick={onPausa}>
                  <Pause className="mr-2 h-5 w-5" /> PAUSA
                </Button>
              )}
              {status === "pausada" && (
                <Button className="h-14 flex-1 bg-success text-lg font-bold text-success-foreground hover:bg-success/90" disabled={busy} onClick={onRetomar}>
                  <Play className="mr-2 h-5 w-5" /> RETOMAR
                </Button>
              )}
              {s && (
                <Button variant="outline" className="h-14 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy} onClick={onEncerrar}>
                  <Square className="mr-1 h-4 w-4" /> FIM
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PausaDialog({
  m,
  onClose,
  onConfirm,
}: {
  m: PainelMaquina | null;
  onClose: () => void;
  onConfirm: (motivo: string, planejada: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [planejada, setPlanejada] = useState(false);
  const ok = motivo.trim().length >= 2;

  return (
    <Dialog
      open={!!m}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setMotivo("");
          setPlanejada(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausar {m?.nome}</DialogTitle>
          <DialogDescription>Por que a máquina vai parar?</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_RAPIDOS.map((r) => (
              <Button
                key={r.label}
                type="button"
                size="sm"
                variant={motivo === r.label ? "default" : "outline"}
                onClick={() => {
                  setMotivo(r.label);
                  setPlanejada(r.planejada);
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Textarea
            autoFocus
            placeholder="Escreva o motivo da parada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
          />
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={planejada} onCheckedChange={(v) => setPlanejada(v === true)} className="mt-0.5" />
            <span>
              Pausa planejada (almoço, café)
              <span className="block text-xs text-muted-foreground">Não conta como parada no indicador de disponibilidade.</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!ok}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={() => {
              onConfirm(motivo.trim(), planejada);
              setMotivo("");
              setPlanejada(false);
            }}
          >
            <Pause className="mr-1 h-4 w-4" /> Pausar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QtdDialog({
  m,
  onClose,
  onConfirm,
}: {
  m: PainelMaquina | null;
  onClose: () => void;
  onConfirm: (q: number) => void;
}) {
  const [valor, setValor] = useState("");
  const q = Number(valor);
  const ok = Number.isInteger(q) && q > 0 && q <= 100000;

  const enviar = () => {
    if (!ok) return;
    onConfirm(q);
    setValor("");
  };

  return (
    <Dialog
      open={!!m}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setValor("");
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lançar peças · {m?.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="qtd">Quantidade</Label>
          <Input
            id="qtd"
            autoFocus
            type="number"
            inputMode="numeric"
            min={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            className="h-14 text-center text-2xl font-bold"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok} onClick={enviar}>Lançar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
