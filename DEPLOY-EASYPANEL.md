# Marcenaria: deploy no EasyPanel

App TanStack Start (SSR) rodando em Bun, mesmo molde do Hora a Hora.
Banco: Supabase SMERP, schema `marcenaria`.

## Ordem (um passo por vez, esperar cada um terminar)

1. **Banco**: rodar `erp/migracao/marcenaria_schema.sql` no SQL Editor do SMERP.
   Depois, rodar também as versões atualizadas de:
   - `erp/migracao/my_systems.sql`
   - `erp/migracao/utilitarios-my-systems.sql`
   - `erp/migracao/admin_users.sql`
2. **PostgREST**: acrescentar `marcenaria` em `PGRST_DB_SCHEMAS` no serviço do Supabase e reiniciar.
3. **Usuários**: no Hub, aba Usuários, liberar "Marcenaria" para o líder (papel Líder) e para quem só acompanha (Visualizador).
4. **EasyPanel**: criar o app `marcenaria`.
   - Fonte: GitHub, repo `marcenaria-solucao`, branch `main` (token clássico com scope `repo`).
   - Build: Dockerfile (raiz).
   - Porta: 3000.
   - Variáveis de ambiente (as mesmas do Hora a Hora):
     - `SUPABASE_URL`
     - `SUPABASE_PUBLISHABLE_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - As `VITE_SUPABASE_*` já vêm no `.env` versionado (entram no build).
5. Conferir a URL gerada e, se for diferente de `https://solucaomoveis-marcenaria.h5xdag.easypanel.host/`,
   ajustar `APPS.marcenaria` no `erp/config.js`.
6. Só então dar push no `erp` (Hub).

## Instalar dependência nova

Usar `bun add <pacote>` (o build roda `bun install --frozen-lockfile`).

## Fechamento automático

Sessões esquecidas abertas fecham quando alguém abre o app (Controle). Se o SMERP tiver
`pg_cron`, dá pra agendar também (bloco comentado no fim do `marcenaria_schema.sql`).
