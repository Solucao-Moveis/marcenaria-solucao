import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escuta mudanças nas tabelas do cronômetro (outro aparelho apertou START,
 * lançou peça...) e recarrega as consultas indicadas.
 */
export function useMarcenariaRealtime(queryKeys: unknown[][]) {
  const qc = useQueryClient();
  const keySig = JSON.stringify(queryKeys);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      // agrupa rajadas (+1 +1 +1) numa recarga só
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const k of queryKeys) void qc.invalidateQueries({ queryKey: k });
      }, 300);
    };
    const channel = supabase
      .channel(`marcenaria-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "marcenaria", table: "sessoes" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "marcenaria", table: "eventos" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "marcenaria", table: "producoes" }, invalidate)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, keySig]);
}

/** Relógio que bate a cada segundo (para os cronômetros na tela). */
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
