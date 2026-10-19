import { supabase } from "@/integrations/supabase/client";
import { ALL_TIME_SLOTS, getBaseGoalSlots, type TimeSlot } from "@/lib/time-slots";

// ============================================================
// Tipos e contas da Marcenaria (schema 'marcenaria').
// A fonte da verdade são os EVENTOS do cronômetro; os tempos
// são calculados a partir dos intervalos (rodando / parada).
// ============================================================

export type Papel = "admin" | "lider" | "visualizador";
export type SessaoStatus = "rodando" | "pausada" | "encerrada";
export type EventoTipo = "start" | "pausa" | "retomar" | "end";

export type Maquina = {
  id: string;
  nome: string;
  ordem: number;
  meta_padrao: number;
  ativo: boolean;
};

export type Meta = { id: string; maquina_id: string; data: string; meta_pecas: number };

export type Sessao = {
  id: string;
  maquina_id: string;
  data: string;
  iniciado_em: string;
  encerrado_em: string | null;
  status: SessaoStatus;
  fechado_auto: boolean;
};

export type Evento = {
  id: string;
  sessao_id: string;
  tipo: EventoTipo;
  em: string;
  observacao: string | null;
  planejada: boolean;
};

export type Producao = {
  id: string;
  sessao_id: string;
  maquina_id: string;
  quantidade: number;
  lancado_em: string;
};

export type Intervalo = {
  maquina_id: string;
  sessao_id: string;
  estado: "rodando" | "parada";
  inicio: string;
  fim: string;
  segundos: number;
  motivo: string | null;
  planejada: boolean;
};

export type ResumoDia = {
  maquina_id: string;
  maquina: string;
  meta: number;
  pecas: number;
  produtivo_seg: number;
  parado_seg: number;
  planejado_seg: number;
};

export type PainelMaquina = {
  id: string;
  nome: string;
  meta: number;
  pecas: number;
  produtivo_seg: number;
  parado_seg: number;
  planejado_seg: number;
  sessoes_dia: number;
  sessao: {
    id: string;
    status: Exclude<SessaoStatus, "encerrada">;
    iniciado_em: string;
    ultimo_evento_em: string;
    motivo: string | null;
    planejada: boolean | null;
    ultimo_lancamento: number | null;
  } | null;
};

export type Painel = { agora: string; data: string; maquinas: PainelMaquina[] };

// ---------- chamadas ----------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  painel: () => rpc<Painel>("painel_controle"),
  iniciar: (maquina: string) => rpc<string>("iniciar", { _maquina: maquina }),
  pausar: (sessao: string, motivo: string, planejada: boolean) =>
    rpc<void>("pausar", { _sessao: sessao, _motivo: motivo, _planejada: planejada }),
  retomar: (sessao: string) => rpc<void>("retomar", { _sessao: sessao }),
  encerrar: (sessao: string) => rpc<void>("encerrar", { _sessao: sessao }),
  encerrarTodas: () => rpc<number>("encerrar_todas"),
  lancarPecas: (sessao: string, qtd: number) => rpc<void>("lancar_pecas", { _sessao: sessao, _qtd: qtd }),
  desfazer: (sessao: string) => rpc<number>("desfazer_ultimo_lancamento", { _sessao: sessao }),
  ajustarEvento: (evento: string, em: string, observacao?: string | null) =>
    rpc<void>("ajustar_evento", { _evento: evento, _em: em, _observacao: observacao ?? null }),
  ajustarProducao: (producao: string, qtd: number) =>
    rpc<void>("ajustar_producao", { _producao: producao, _qtd: qtd }),
  intervalos: async (data: string) =>
    (await rpc<Intervalo[]>("intervalos", { _data: data })).map((i) => ({ ...i, segundos: Number(i.segundos) })),
  resumoDia: async (data: string) =>
    (await rpc<ResumoDia[]>("resumo_dia", { _data: data })).map((r) => ({
      ...r,
      pecas: Number(r.pecas),
      produtivo_seg: Number(r.produtivo_seg),
      parado_seg: Number(r.parado_seg),
      planejado_seg: Number(r.planejado_seg),
    })),

  maquinas: async (incluirArquivadas = false) => {
    let q = supabase.from("maquinas").select("id, nome, ordem, meta_padrao, ativo").order("ordem").order("nome");
    if (!incluirArquivadas) q = q.eq("ativo", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Maquina[];
  },
  metas: async (data: string) => {
    const { data: rows, error } = await supabase.from("metas").select("id, maquina_id, data, meta_pecas").eq("data", data);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Meta[];
  },
  sessoesDoDia: async (data: string) => {
    const { data: rows, error } = await supabase
      .from("sessoes")
      .select("id, maquina_id, data, iniciado_em, encerrado_em, status, fechado_auto")
      .eq("data", data)
      .order("iniciado_em");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Sessao[];
  },
  eventosDe: async (sessoes: string[]) => {
    if (!sessoes.length) return [] as Evento[];
    const { data, error } = await supabase
      .from("eventos")
      .select("id, sessao_id, tipo, em, observacao, planejada")
      .in("sessao_id", sessoes)
      .order("em");
    if (error) throw new Error(error.message);
    return (data ?? []) as Evento[];
  },
  producoesDe: async (sessoes: string[]) => {
    if (!sessoes.length) return [] as Producao[];
    const { data, error } = await supabase
      .from("producoes")
      .select("id, sessao_id, maquina_id, quantidade, lancado_em")
      .in("sessao_id", sessoes)
      .order("lancado_em");
    if (error) throw new Error(error.message);
    return (data ?? []) as Producao[];
  },
};

// ---------- formatação ----------

/** 3725 -> "01:02:05" (cronômetro) */
export function fmtRelogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 3725 -> "1h 02min"; 300 -> "5min"; 40 -> "40s" */
export function fmtDur(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

export function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtHoraSeg(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

// ---------- contas (mesma fórmula do resumo_dia do banco) ----------

export type Totais = { produtivo: number; parado: number; planejado: number };

export function somarIntervalos(intervalos: Intervalo[]): Totais {
  const t: Totais = { produtivo: 0, parado: 0, planejado: 0 };
  for (const i of intervalos) {
    if (i.estado === "rodando") t.produtivo += i.segundos;
    else if (i.planejada) t.planejado += i.segundos;
    else t.parado += i.segundos;
  }
  return t;
}

/** Disponibilidade = rodando / (rodando + parado). Pausa planejada (almoço, café) não entra. */
export function disponibilidade(t: Totais): number | null {
  return pct(t.produtivo, t.produtivo + t.parado);
}

export function pecasPorHora(pecas: number, produtivoSeg: number): number | null {
  if (produtivoSeg < 60) return null;
  return pecas / (produtivoSeg / 3600);
}

// ---------- turno / hora a hora ----------

function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function hhmm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Faixa de hora (do Hora a Hora) em que um horário cai; 'almoco' entre 12h e 13h; null fora do expediente. */
export function faixaDoHorario(iso: string): TimeSlot | "almoco" | null {
  const min = minutosDoDia(new Date(iso));
  if (min >= 12 * 60 && min < 13 * 60) return "almoco";
  return ALL_TIME_SLOTS.find((s) => min >= hhmm(s.start) && min < hhmm(s.end)) ?? null;
}

/**
 * Quanto da meta já era esperado neste momento: meta × fração do turno normal
 * já decorrida (sem contar o almoço). Dia passado = meta cheia; futuro = 0.
 */
export function metaEsperadaAgora(meta: number, dataIso: string, agora: Date): number {
  if (meta <= 0) return 0;
  const hoje = isoLocal(agora);
  if (dataIso < hoje) return meta;
  if (dataIso > hoje) return 0;
  const slots = getBaseGoalSlots(dataIso);
  const total = slots.reduce((s, x) => s + x.minutes, 0);
  if (!total) return meta;
  const now = minutosDoDia(agora);
  let feito = 0;
  for (const s of slots) {
    const a = hhmm(s.start);
    const b = hhmm(s.end);
    feito += Math.max(0, Math.min(now, b) - a);
  }
  return Math.round(meta * Math.min(1, feito / total));
}

/** Minutos de turno normal que ainda faltam (sem almoço). Dia passado = 0; dia futuro = turno inteiro. */
export function minutosRestantesTurno(dataIso: string, agora: Date): number {
  const slots = getBaseGoalSlots(dataIso);
  const total = slots.reduce((s, x) => s + x.minutes, 0);
  const hoje = isoLocal(agora);
  if (dataIso < hoje) return 0;
  if (dataIso > hoje) return total;
  const now = minutosDoDia(agora);
  let resta = 0;
  for (const s of slots) resta += Math.max(0, hhmm(s.end) - Math.max(now, hhmm(s.start)));
  return resta;
}

export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- sugestões de motivo (texto livre, só pra agilizar) ----------

export const MOTIVOS_RAPIDOS: { label: string; planejada: boolean }[] = [
  { label: "Almoço", planejada: true },
  { label: "Café / intervalo", planejada: true },
  { label: "Manutenção", planejada: false },
  { label: "Falta de material", planejada: false },
  { label: "Setup / troca de ferramenta", planejada: false },
  { label: "Ajuste de máquina", planejada: false },
  { label: "Falta de operador", planejada: false },
];
