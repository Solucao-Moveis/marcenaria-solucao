import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CheckCircle2, AlertTriangle, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/app/DatePicker";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMarcenariaRealtime, useTick } from "@/lib/use-realtime";
import { Velocimetro } from "@/components/app/Velocimetro";
import { formatDateBR, getApontamentoSlots, getBaseGoalSlots, todayIso, type TimeSlot } from "@/lib/time-slots";
import {
  api,
  disponibilidade,
  faixaDoHorario,
  fmtDur,
  fmtHora,
  metaEsperadaAgora,
  minutosRestantesTurno,
  pct,
  pecasPorHora,
  somarIntervalos,
  type Intervalo,
  type Producao,
  type ResumoDia,
} from "@/lib/marcenaria";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

type Linha = ResumoDia & {
  pecasApp: number;
  produtivoApp: number;
  paradoApp: number;
  planejadoApp: number;
  conferido: boolean;
};

function DashboardPage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState(todayIso());
  const [maquina, setMaquina] = useState("todas");

  const ehHoje = data === todayIso();
  // hoje: recarrega a cada minuto (tempos de quem está rodando/parado andam com o relógio)
  const refetchInterval = ehHoje ? 60_000 : false;
  const intervalosQ = useQuery({ queryKey: ["intervalos", data], queryFn: () => api.intervalos(data), refetchInterval });
  const resumoQ = useQuery({ queryKey: ["resumo", data], queryFn: () => api.resumoDia(data), refetchInterval });
  const producoesQ = useQuery({
    queryKey: ["producoes-dia", data],
    queryFn: async () => api.producoesDe((await api.sessoesDoDia(data)).map((s) => s.id)),
    refetchInterval,
  });
  useMarcenariaRealtime(ehHoje ? [["intervalos", data], ["resumo", data], ["producoes-dia", data]] : []);

  const carregando = intervalosQ.isLoading || resumoQ.isLoading || producoesQ.isLoading;
  const erro = intervalosQ.error || resumoQ.error || producoesQ.error;

  const intervalos = useMemo(
    () => (intervalosQ.data ?? []).filter((i) => maquina === "todas" || i.maquina_id === maquina),
    [intervalosQ.data, maquina],
  );
  const producoes = useMemo(
    () => (producoesQ.data ?? []).filter((p) => maquina === "todas" || p.maquina_id === maquina),
    [producoesQ.data, maquina],
  );

  // Conta do app (intervalos + lançamentos) lado a lado com a do banco (resumo_dia).
  const linhas: Linha[] = useMemo(() => {
    return (resumoQ.data ?? [])
      .filter((r) => maquina === "todas" || r.maquina_id === maquina)
      .map((r) => {
        const iv = (intervalosQ.data ?? []).filter((i) => i.maquina_id === r.maquina_id);
        const t = somarIntervalos(iv);
        const pecasApp = (producoesQ.data ?? [])
          .filter((p) => p.maquina_id === r.maquina_id)
          .reduce((s, p) => s + p.quantidade, 0);
        // trecho ainda aberto: as duas consultas leem o "agora" em instantes diferentes
        const tol = iv.some((i) => Date.parse(i.fim) > Date.now() - 120_000) ? 120 : 2;
        const conferido =
          pecasApp === r.pecas &&
          Math.abs(t.produtivo - r.produtivo_seg) <= tol &&
          Math.abs(t.parado - r.parado_seg) <= tol &&
          Math.abs(t.planejado - r.planejado_seg) <= tol;
        return { ...r, pecasApp, produtivoApp: t.produtivo, paradoApp: t.parado, planejadoApp: t.planejado, conferido };
      });
  }, [resumoQ.data, intervalosQ.data, producoesQ.data, maquina]);

  const totais = useMemo(() => {
    const t = somarIntervalos(intervalos);
    const pecas = producoes.reduce((s, p) => s + p.quantidade, 0);
    const meta = linhas.reduce((s, l) => s + l.meta, 0);
    return { ...t, pecas, meta };
  }, [intervalos, producoes, linhas]);

  const divergentes = linhas.filter((l) => !l.conferido);

  const exportarPdf = () => gerarPdf(data, linhas, intervalos, maquinasPorId(linhas));

  return (
    <div className="space-y-4">
      {/* filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker value={data} onChange={(v) => v && setData(v)} />
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Máquina</Label>
          <Select value={maquina} onValueChange={setMaquina}>
            <SelectTrigger className="h-10 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as máquinas</SelectItem>
              {(resumoQ.data ?? []).map((r) => (
                <SelectItem key={r.maquina_id} value={r.maquina_id}>{r.maquina}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!carregando && !erro && linhas.length > 0 && (
            divergentes.length === 0 ? (
              <Badge variant="outline" className="border-success/40 text-success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Conferido com o banco
              </Badge>
            ) : (
              <Badge variant="outline" className="border-destructive/40 text-destructive" title={divergentes.map((d) => d.maquina).join(", ")}>
                <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Diferença app × banco em {divergentes.length} máquina(s)
              </Badge>
            )
          )}
          <Button variant="outline" size="sm" onClick={exportarPdf} disabled={carregando || linhas.length === 0}>
            <FileDown className="mr-1 h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {erro ? (
        <div className="py-10 text-center text-destructive">Erro ao carregar: {(erro as Error).message}</div>
      ) : carregando ? (
        <div className="py-10 text-center text-muted-foreground">Carregando…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Peças" value={String(totais.pecas)} />
            <Kpi label="Meta" value={totais.meta ? String(totais.meta) : "-"} />
            <Kpi
              label="% da meta"
              value={totais.meta ? `${pct(totais.pecas, totais.meta)}%` : "-"}
              tone={!totais.meta ? undefined : totais.pecas >= totais.meta ? "success" : "destructive"}
            />
            <Kpi label="Tempo rodando" value={fmtDur(totais.produtivo)} />
            <Kpi
              label="Tempo parado"
              value={fmtDur(totais.parado)}
              sub={totais.planejado ? `+ ${fmtDur(totais.planejado)} de pausa planejada` : undefined}
              tone={totais.parado > 0 ? "warning" : undefined}
            />
            <Kpi
              label="Disponibilidade"
              value={disponibilidade(totais) == null ? "-" : `${disponibilidade(totais)}%`}
              sub="rodando ÷ (rodando + parado)"
            />
            <Kpi
              label="Peças/hora"
              value={(() => {
                const r = pecasPorHora(totais.pecas, totais.produtivo);
                return r == null ? "-" : r.toFixed(1);
              })()}
              sub="por hora rodando"
            />
          </div>

          {linhas.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma máquina com dados em {formatDateBR(data)}.</CardContent></Card>
          ) : (
            <>
              <Ritmo linhas={linhas} intervalos={intervalos} data={data} geral={maquina === "todas"} />

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">Meta × realizado por máquina</CardTitle></CardHeader>
                  <CardContent>
                    <div style={{ height: Math.max(220, linhas.length * 44 + 60) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={linhas.map((l) => ({ name: l.maquina, Meta: l.meta, Realizado: l.pecasApp }))}
                          layout="vertical"
                          margin={{ left: 10, right: 16 }}
                          barGap={2}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={isMobile ? 80 : 140} tick={{ fontSize: 11 }} />
                          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                          <Legend />
                          <Bar dataKey="Meta" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="Realizado" fill="#2563eb" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Peças por hora</CardTitle></CardHeader>
                  <CardContent>
                    <PecasPorHoraChart producoes={producoes} data={data} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Hora a hora (peças por máquina)</CardTitle></CardHeader>
                <CardContent>
                  <Heatmap linhas={linhas} producoes={producoes} data={data} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Linha do tempo das máquinas</CardTitle></CardHeader>
                <CardContent>
                  <Timeline linhas={linhas} intervalos={intervalos} data={data} />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Motivos de parada (tempo)</CardTitle></CardHeader>
                  <CardContent><MotivosResumo intervalos={intervalos} /></CardContent>
                </Card>
                <Card className="lg:col-span-3">
                  <CardHeader><CardTitle className="text-base">Paradas do dia</CardTitle></CardHeader>
                  <CardContent><ParadasTabela intervalos={intervalos} nomes={maquinasPorId(linhas)} /></CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Resumo por máquina</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2">Máquina</th>
                        <th className="py-2 text-right">Peças</th>
                        <th className="py-2 text-right">Meta</th>
                        <th className="py-2 text-right">% meta</th>
                        <th className="py-2 text-right">Rodando</th>
                        <th className="py-2 text-right">Parado</th>
                        <th className="py-2 text-right">Planejada</th>
                        <th className="py-2 text-right">Disp.</th>
                        <th className="py-2 text-right">Peças/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const r = pecasPorHora(l.pecasApp, l.produtivoApp);
                        const d = disponibilidade({ produtivo: l.produtivoApp, parado: l.paradoApp, planejado: l.planejadoApp });
                        const p = pct(l.pecasApp, l.meta);
                        return (
                          <tr key={l.maquina_id} className="border-b last:border-0">
                            <td className="py-2 font-medium">
                              {l.maquina}
                              {!l.conferido && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-destructive" aria-label="diferença app × banco" />}
                            </td>
                            <td className="py-2 text-right tabular-nums">{l.pecasApp}</td>
                            <td className="py-2 text-right tabular-nums">{l.meta || "-"}</td>
                            <td className={cn("py-2 text-right font-semibold tabular-nums", p == null ? "text-muted-foreground" : p >= 100 ? "text-success" : "text-destructive")}>
                              {p == null ? "-" : `${p}%`}
                            </td>
                            <td className="py-2 text-right tabular-nums">{fmtDur(l.produtivoApp)}</td>
                            <td className="py-2 text-right tabular-nums">{fmtDur(l.paradoApp)}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtDur(l.planejadoApp)}</td>
                            <td className="py-2 text-right tabular-nums">{d == null ? "-" : `${d}%`}</td>
                            <td className="py-2 text-right tabular-nums">{r == null ? "-" : r.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function maquinasPorId(linhas: { maquina_id: string; maquina: string }[]) {
  return Object.fromEntries(linhas.map((l) => [l.maquina_id, l.maquina])) as Record<string, string>;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "warning" | "destructive" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------- ritmo (velocímetros) ----------

type EstadoAgora = "rodando" | "parada" | "planejada" | null;

function estadoAgora(intervalos: Intervalo[], maquinaId: string, agora: number): EstadoAgora {
  // trecho ainda aberto = termina "agora" (o banco fecha o trecho aberto no horário da consulta)
  const aberto = intervalos.find((i) => i.maquina_id === maquinaId && Date.parse(i.fim) >= agora - 150_000);
  if (!aberto) return null;
  return aberto.estado === "rodando" ? "rodando" : aberto.planejada ? "planejada" : "parada";
}

function statusRitmo(meta: number, pecas: number, esperado: number, hoje: boolean) {
  if (meta === 0) return { cls: "bg-muted text-muted-foreground", t: pecas > 0 ? "Sem meta lançada" : "Sem meta" };
  if (hoje && esperado === 0) return { cls: "bg-muted text-muted-foreground", t: "Aguardando o turno" };
  const r = pecas / esperado;
  if (r >= 1) return { cls: "bg-success text-success-foreground", t: hoje ? "No ritmo" : "Meta batida" };
  if (r >= 0.9) return { cls: "bg-warning text-warning-foreground", t: "Atenção" };
  return { cls: "bg-destructive text-destructive-foreground", t: hoje ? "Atrasado" : "Abaixo da meta" };
}

function Ritmo({ linhas, intervalos, data, geral }: { linhas: Linha[]; intervalos: Intervalo[]; data: string; geral: boolean }) {
  // a cada 30s o esperado anda com o relógio, mesmo sem peça nova
  const agora = useTick(30_000);
  const hoje = data === todayIso();
  const hora = new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const legenda = (meta: number, esperado: number) =>
    meta === 0 ? "sem meta no dia" : hoje ? (esperado === 0 ? "turno não começou" : `até as ${hora}`) : "do dia";

  const cards = linhas.map((l) => {
    const esperado = metaEsperadaAgora(l.meta, data, new Date(agora));
    return { l, esperado, pct: esperado > 0 ? (100 * l.pecasApp) / esperado : null };
  });
  const tot = cards.reduce((t, c) => ({ meta: t.meta + c.l.meta, pecas: t.pecas + c.l.pecasApp, esperado: t.esperado + c.esperado }), {
    meta: 0,
    pecas: 0,
    esperado: 0,
  });
  const totPct = tot.esperado > 0 ? (100 * tot.pecas) / tot.esperado : null;

  // uma máquina só (ou uma escolhida no filtro): tela de destaque, velocímetro grande
  if (cards.length === 1) {
    const { l, esperado, pct: p } = cards[0];
    return (
      <RitmoDestaque
        l={l}
        esperado={esperado}
        pct={p}
        hoje={hoje}
        agora={agora}
        data={data}
        legenda={legenda(l.meta, esperado)}
        estado={hoje ? estadoAgora(intervalos, l.maquina_id, agora) : null}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ritmo {hoje ? "agora" : "do dia"}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ponteiro = peças feitas ÷ peças esperadas {hoje ? "até agora (meta do dia proporcional ao turno já passado, sem o almoço)" : "no dia (meta cheia)"}.
          Vermelho abaixo de 90% · amarelo 90 a 99% · verde 100% ou mais.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {geral && linhas.length > 1 && (
            <RitmoCard
              titulo="Marcenaria (todas)"
              destaque
              pecas={tot.pecas}
              meta={tot.meta}
              esperado={tot.esperado}
              pct={totPct}
              hoje={hoje}
              legenda={legenda(tot.meta, tot.esperado)}
              estado={null}
            />
          )}
          {cards.map(({ l, esperado, pct: p }) => (
            <RitmoCard
              key={l.maquina_id}
              titulo={l.maquina}
              pecas={l.pecasApp}
              meta={l.meta}
              esperado={esperado}
              pct={p}
              hoje={hoje}
              legenda={legenda(l.meta, esperado)}
              estado={hoje ? estadoAgora(intervalos, l.maquina_id, agora) : null}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const ESTADO_AGORA = {
  rodando: { dot: "bg-success animate-pulse", t: "Rodando agora" },
  parada: { dot: "bg-warning", t: "Parada agora" },
  planejada: { dot: "bg-muted-foreground", t: "Em pausa planejada" },
} as const;

function RitmoDestaque({
  l,
  esperado,
  pct: p,
  hoje,
  agora,
  data,
  legenda,
  estado,
}: {
  l: Linha;
  esperado: number;
  pct: number | null;
  hoje: boolean;
  agora: number;
  data: string;
  legenda: string;
  estado: EstadoAgora;
}) {
  const st = statusRitmo(l.meta, l.pecasApp, esperado, hoje);
  const dif = l.pecasApp - Math.round(esperado);
  const ritmo = pecasPorHora(l.pecasApp, l.produtivoApp);
  const restaMin = minutosRestantesTurno(data, new Date(agora));
  const restaH = restaMin / 60;
  const falta = Math.max(0, l.meta - l.pecasApp);
  const previsao = ritmo != null && hoje ? Math.round(l.pecasApp + ritmo * restaH) : null;
  const necessario = hoje && l.meta > 0 && falta > 0 && restaH > 0 ? falta / restaH : null;
  const d = disponibilidade({ produtivo: l.produtivoApp, parado: l.paradoApp, planejado: l.planejadoApp });

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* velocímetro grande */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Ritmo {hoje ? "agora" : "do dia"}</div>
                <div className="text-xl font-bold">{l.maquina}</div>
                {estado && (
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", ESTADO_AGORA[estado].dot)} /> {ESTADO_AGORA[estado].t}
                  </div>
                )}
              </div>
              <Badge className={cn("px-3 py-1 text-sm", st.cls)}>{st.t}</Badge>
            </div>
            <Velocimetro pct={p} legenda={legenda} grande />
          </div>

          {/* números */}
          <div className="grid grid-cols-2 gap-3">
            <Bloco rotulo="Feito" valor={String(l.pecasApp)} sub={l.meta > 0 ? `de ${l.meta} no dia (${pct(l.pecasApp, l.meta)}%)` : "sem meta no dia"} grande />
            <Bloco
              rotulo={hoje ? "Esperado até agora" : "Meta do dia"}
              valor={l.meta > 0 ? String(Math.round(esperado)) : "-"}
              sub={
                l.meta > 0 && esperado > 0 ? (
                  <span className={cn("font-semibold", dif >= 0 ? "text-success" : "text-destructive")}>
                    {dif >= 0 ? "▲" : "▼"} {Math.abs(dif)} {dif >= 0 ? "acima" : "abaixo"}
                  </span>
                ) : undefined
              }
              grande
            />
            <Bloco rotulo="Ritmo real" valor={ritmo == null ? "-" : ritmo.toFixed(1)} sub="peças por hora rodando" />
            {hoje ? (
              <Bloco
                rotulo="Para bater a meta"
                valor={l.meta === 0 ? "-" : falta === 0 ? "Batida" : necessario == null ? "-" : necessario.toFixed(1)}
                sub={
                  l.meta === 0
                    ? "sem meta"
                    : falta === 0
                      ? "meta do dia alcançada"
                      : restaMin > 0
                        ? `peças/h nas ${fmtDur(restaMin * 60)} que faltam`
                        : `turno acabou, faltaram ${falta}`
                }
                tom={falta === 0 && l.meta > 0 ? "success" : undefined}
              />
            ) : (
              <Bloco rotulo="Resultado" valor={l.meta > 0 ? `${pct(l.pecasApp, l.meta)}%` : "-"} sub="da meta do dia" />
            )}
            {hoje && (
              <Bloco
                rotulo="Previsão no fim do turno"
                valor={previsao == null ? "-" : String(previsao)}
                sub={previsao == null ? "aguardando ritmo" : l.meta > 0 ? `${pct(previsao, l.meta)}% da meta, mantendo o ritmo` : "mantendo o ritmo"}
                tom={previsao == null || l.meta === 0 ? undefined : previsao >= l.meta ? "success" : "destructive"}
              />
            )}
            <Bloco
              rotulo="Rodando / parado"
              valor={`${fmtDur(l.produtivoApp)} / ${fmtDur(l.paradoApp)}`}
              sub={d == null ? "disponibilidade -" : `disponibilidade ${d}%`}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Ponteiro = peças feitas ÷ peças esperadas {hoje ? "até agora (meta do dia proporcional ao turno já passado, sem o almoço)" : "no dia"}. Vermelho abaixo de 90% · amarelo 90 a 99% · verde 100% ou mais.
        </p>
      </CardContent>
    </Card>
  );
}

function Bloco({
  rotulo,
  valor,
  sub,
  grande,
  tom,
}: {
  rotulo: string;
  valor: string;
  sub?: React.ReactNode;
  grande?: boolean;
  tom?: "success" | "destructive";
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-3 sm:p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div
        className={cn(
          "font-bold tabular-nums",
          grande ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl",
          tom === "success" && "text-success",
          tom === "destructive" && "text-destructive",
        )}
      >
        {valor}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RitmoCard({
  titulo,
  destaque,
  pecas,
  meta,
  esperado,
  pct: p,
  hoje,
  legenda,
  estado,
}: {
  titulo: string;
  destaque?: boolean;
  pecas: number;
  meta: number;
  esperado: number;
  pct: number | null;
  hoje: boolean;
  legenda: string;
  estado: EstadoAgora;
}) {
  const st = statusRitmo(meta, pecas, esperado, hoje);
  const dif = pecas - Math.round(esperado);
  const ESTADO = {
    rodando: { dot: "bg-success animate-pulse", t: "rodando" },
    parada: { dot: "bg-warning", t: "parada" },
    planejada: { dot: "bg-muted-foreground", t: "pausa planejada" },
  } as const;
  return (
    <div className={cn("rounded-xl border p-3", destaque && "border-primary/40 bg-primary/5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{titulo}</div>
          {estado && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("inline-block h-2 w-2 rounded-full", ESTADO[estado].dot)} /> {ESTADO[estado].t}
            </div>
          )}
        </div>
        <Badge className={cn("shrink-0 text-[10px]", st.cls)}>{st.t}</Badge>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">
        {pecas}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{meta > 0 ? `de ${meta}` : "peças"}</span>
      </div>
      <Velocimetro pct={p} legenda={legenda} />
      {meta > 0 && esperado > 0 && (
        <div className="text-center text-xs text-muted-foreground">
          esperado {hoje ? "até agora" : "no dia"}: <b className="text-foreground">{Math.round(esperado)}</b>{" "}
          <span className={cn("font-semibold", dif >= 0 ? "text-success" : "text-destructive")}>
            {dif >= 0 ? "▲" : "▼"} {Math.abs(dif)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- hora a hora ----------

type Coluna = { key: string; label: string; slot?: TimeSlot };

function colunasDoDia(data: string, producoes: Producao[]): Coluna[] {
  const slots = getApontamentoSlots(data);
  const cols: Coluna[] = [];
  slots.forEach((s, i) => {
    if (i === 5) cols.push({ key: "almoco", label: "Almoço" });
    cols.push({ key: String(s.index), label: s.label, slot: s });
  });
  // lançamentos fora das faixas (ex.: sexta depois das 16h) não somem: vão pra "Outros"
  const temFora = producoes.some((p) => {
    const f = faixaDoHorario(p.lancado_em);
    return f === null || (f !== "almoco" && !slots.some((s) => s.index === f.index));
  });
  if (temFora) cols.push({ key: "fora", label: "Outros" });
  return cols;
}

function chaveDaFaixa(iso: string, cols: Coluna[]): string {
  const f = faixaDoHorario(iso);
  if (f === "almoco") return "almoco";
  if (f && cols.some((c) => c.key === String(f.index))) return String(f.index);
  return "fora";
}

function PecasPorHoraChart({ producoes, data }: { producoes: Producao[]; data: string }) {
  const cols = colunasDoDia(data, producoes);
  const soma: Record<string, number> = {};
  for (const p of producoes) {
    const k = chaveDaFaixa(p.lancado_em, cols);
    soma[k] = (soma[k] ?? 0) + p.quantidade;
  }
  const rows = cols.map((c) => ({ hora: c.label, Peças: soma[c.key] ?? 0 }));
  if (producoes.length === 0) {
    return <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">Sem peças lançadas.</div>;
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: -10, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="hora" tick={{ fontSize: 11 }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Bar dataKey="Peças" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Heatmap({ linhas, producoes, data }: { linhas: Linha[]; producoes: Producao[]; data: string }) {
  const cols = colunasDoDia(data, producoes);
  const baseSlots = getBaseGoalSlots(data).length || 1;
  const celula: Record<string, number> = {};
  for (const p of producoes) {
    const k = `${p.maquina_id}|${chaveDaFaixa(p.lancado_em, cols)}`;
    celula[k] = (celula[k] ?? 0) + p.quantidade;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-semibold">Máquina</th>
            {cols.map((c) => (
              <th key={c.key} className="px-1 py-1 text-center font-medium text-muted-foreground">{c.label}</th>
            ))}
            <th className="px-2 py-1 text-center font-semibold">Meta/h</th>
            <th className="px-2 py-1 text-center font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const metaHora = l.meta / baseSlots;
            return (
              <tr key={l.maquina_id} className="border-t">
                <td className="sticky left-0 bg-card px-2 py-1 font-medium">{l.maquina}</td>
                {cols.map((c) => {
                  const v = celula[`${l.maquina_id}|${c.key}`];
                  const naMeta = !!c.slot && getBaseGoalSlots(data).some((s) => s.index === c.slot!.index);
                  let tom: keyof typeof TONS = "empty";
                  if (v != null) {
                    if (!l.meta || !naMeta) tom = "neutral";
                    else {
                      const r = v / Math.max(1, Math.round(metaHora));
                      tom = r > 1.3 ? "exceed" : r >= 1 ? "ok" : r >= 0.9 ? "warn" : "bad";
                    }
                  }
                  return (
                    <td key={c.key} className={cn("px-1 py-1 text-center", c.key === "almoco" && "bg-muted/40")}>
                      <div
                        className={cn("mx-auto flex h-7 w-10 items-center justify-center rounded text-[11px] font-bold", TONS[tom])}
                        title={`${l.maquina} · ${c.label}: ${v ?? 0} peça(s)${naMeta && l.meta ? ` · meta/h ${Math.round(metaHora)}` : ""}`}
                      >
                        {v ?? "-"}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-semibold">{l.meta ? Math.round(metaHora) : "-"}</td>
                <td className="px-2 py-1 text-center font-semibold">{l.pecasApp}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <Leg cls={TONS.exceed} t="acima de 130% da meta/h" />
        <Leg cls={TONS.ok} t="bateu a meta/h" />
        <Leg cls={TONS.warn} t="90 a 99%" />
        <Leg cls={TONS.bad} t="abaixo de 90%" />
        <Leg cls={TONS.neutral} t="sem meta / fora do turno" />
      </div>
    </div>
  );
}

const TONS = {
  ok: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  bad: "bg-destructive text-destructive-foreground",
  empty: "bg-muted text-muted-foreground border border-dashed",
  neutral: "bg-secondary text-secondary-foreground",
  exceed: "bg-exceed text-exceed-foreground",
} as const;

function Leg({ cls, t }: { cls: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-3 w-3 rounded-sm", cls)} /> {t}
    </span>
  );
}

// ---------- linha do tempo ----------

function Timeline({ linhas, intervalos, data }: { linhas: Linha[]; intervalos: Intervalo[]; data: string }) {
  const [y, mo, d] = data.split("-").map(Number);
  const base = new Date(y, mo - 1, d, 0, 0, 0).getTime();
  const fimTurno = getApontamentoSlots(data).length <= 8 ? 16 : 17;
  let ini = base + 7 * 3600_000;
  let fim = base + fimTurno * 3600_000;
  for (const i of intervalos) {
    ini = Math.min(ini, Date.parse(i.inicio));
    fim = Math.max(fim, Date.parse(i.fim));
  }
  ini = Math.floor((ini - base) / 3600_000) * 3600_000 + base;
  fim = Math.ceil((fim - base) / 3600_000) * 3600_000 + base;
  const span = fim - ini || 1;
  const horas: number[] = [];
  for (let t = ini; t <= fim; t += 3600_000) horas.push(t);
  const x = (t: number) => ((t - ini) / span) * 100;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative ml-[120px] h-5 text-[10px] text-muted-foreground">
            {horas.map((h) => (
              <span key={h} className="absolute -translate-x-1/2" style={{ left: `${x(h)}%` }}>
                {String(new Date(h).getHours()).padStart(2, "0")}h
              </span>
            ))}
          </div>
          {linhas.map((l) => {
            const iv = intervalos.filter((i) => i.maquina_id === l.maquina_id);
            return (
              <div key={l.maquina_id} className="flex items-center border-t py-1.5">
                <div className="w-[120px] shrink-0 truncate pr-2 text-xs font-medium">{l.maquina}</div>
                <div className="relative h-7 flex-1 rounded bg-muted/50">
                  {horas.map((h) => (
                    <div key={h} className="absolute top-0 h-full w-px bg-border" style={{ left: `${x(h)}%` }} />
                  ))}
                  {iv.map((i, k) => {
                    const a = Date.parse(i.inicio);
                    const b = Date.parse(i.fim);
                    const cls =
                      i.estado === "rodando" ? "bg-success" : i.planejada ? "bg-muted-foreground/50" : "bg-warning";
                    const rot = i.estado === "rodando" ? "Rodando" : i.planejada ? "Pausa planejada" : "Parada";
                    return (
                      <div
                        key={k}
                        className={cn("absolute top-1 h-5 rounded-sm border-x border-card", cls)}
                        style={{ left: `${x(a)}%`, width: `${Math.max(0.2, x(b) - x(a))}%` }}
                        title={`${rot} · ${fmtHora(i.inicio)}–${fmtHora(i.fim)} (${fmtDur(i.segundos)})${i.motivo ? ` · ${i.motivo}` : ""}`}
                      />
                    );
                  })}
                  {iv.length === 0 && <div className="absolute inset-0 flex items-center pl-2 text-[11px] text-muted-foreground">sem uso</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <Leg cls="bg-success" t="Rodando" />
        <Leg cls="bg-warning" t="Parada" />
        <Leg cls="bg-muted-foreground/50" t="Pausa planejada" />
        <span>Passe o mouse (ou toque) numa barra para ver horário e motivo.</span>
      </div>
    </div>
  );
}

// ---------- paradas ----------

function MotivosResumo({ intervalos }: { intervalos: Intervalo[] }) {
  const grupos = new Map<string, { motivo: string; seg: number; vezes: number; planejada: boolean }>();
  for (const i of intervalos) {
    if (i.estado !== "parada") continue;
    const motivo = (i.motivo ?? "Sem motivo").trim();
    const k = motivo.toLowerCase();
    const g = grupos.get(k) ?? { motivo, seg: 0, vezes: 0, planejada: i.planejada };
    g.seg += i.segundos;
    g.vezes += 1;
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.seg - a.seg);
  if (!lista.length) return <div className="text-sm text-muted-foreground">Nenhuma parada registrada.</div>;
  const max = lista[0].seg || 1;
  return (
    <div className="space-y-2.5">
      {lista.map((g) => (
        <div key={g.motivo}>
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate font-medium">
              {g.motivo}
              {g.planejada && <span className="ml-1 text-muted-foreground">(planejada)</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDur(g.seg)} · {g.vezes}x</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", g.planejada ? "bg-muted-foreground/50" : "bg-warning")}
              style={{ width: `${(g.seg / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ParadasTabela({ intervalos, nomes }: { intervalos: Intervalo[]; nomes: Record<string, string> }) {
  const paradas = intervalos.filter((i) => i.estado === "parada").sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (!paradas.length) return <div className="text-sm text-muted-foreground">Nenhuma parada registrada.</div>;
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-2">Máquina</th>
            <th className="py-2">Horário</th>
            <th className="py-2 text-right">Duração</th>
            <th className="py-2 pl-3">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {paradas.map((p, k) => (
            <Fragment key={k}>
              <tr className="border-b last:border-0">
                <td className="py-1.5 font-medium">{nomes[p.maquina_id] ?? "?"}</td>
                <td className="py-1.5 tabular-nums">{fmtHora(p.inicio)}–{fmtHora(p.fim)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtDur(p.segundos)}</td>
                <td className="py-1.5 pl-3">
                  {p.motivo ?? "-"}
                  {p.planejada && <Badge variant="secondary" className="ml-1.5 text-[10px]">planejada</Badge>}
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- PDF ----------

function gerarPdf(data: string, linhas: Linha[], intervalos: Intervalo[], nomes: Record<string, string>) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(`Marcenaria · Relatório do dia ${formatDateBR(data)}`, 14, 14);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 20);

  autoTable(doc, {
    startY: 26,
    head: [["Máquina", "Peças", "Meta", "% meta", "Rodando", "Parado", "Pausa planejada", "Disponibilidade", "Peças/h"]],
    body: linhas.map((l) => {
      const d = disponibilidade({ produtivo: l.produtivoApp, parado: l.paradoApp, planejado: l.planejadoApp });
      const r = pecasPorHora(l.pecasApp, l.produtivoApp);
      const p = pct(l.pecasApp, l.meta);
      return [
        l.maquina,
        l.pecasApp,
        l.meta || "-",
        p == null ? "-" : `${p}%`,
        fmtDur(l.produtivoApp),
        fmtDur(l.paradoApp),
        fmtDur(l.planejadoApp),
        d == null ? "-" : `${d}%`,
        r == null ? "-" : r.toFixed(1),
      ];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [46, 120, 210] },
  });

  const paradas = intervalos.filter((i) => i.estado === "parada").sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (paradas.length) {
    // @ts-expect-error lastAutoTable é injetado pelo jspdf-autotable
    const y = (doc.lastAutoTable?.finalY ?? 40) + 8;
    doc.setFontSize(11);
    doc.text("Paradas", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Máquina", "Início", "Fim", "Duração", "Motivo", "Tipo"]],
      body: paradas.map((p) => [
        nomes[p.maquina_id] ?? "?",
        fmtHora(p.inicio),
        fmtHora(p.fim),
        fmtDur(p.segundos),
        p.motivo ?? "-",
        p.planejada ? "Planejada" : "Parada",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [46, 120, 210] },
    });
  }
  doc.save(`marcenaria-${data}.pdf`);
}
