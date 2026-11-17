-- =====================================================================
-- ARCA — Migração 4: porta de leitura da camada gold pela API
-- A API do Supabase só enxerga o schema public por padrão. Em vez de
-- exigir configuração manual no painel, publicamos visões somente leitura
-- (prefixo v_) que apontam para a camada gold. Dados agregados, sem dado pessoal.
-- =====================================================================
create or replace view public.v_situacao_bairros  as select * from gold.situacao_bairros;
create or replace view public.v_leituras_por_hora as select * from gold.leituras_por_hora;
create or replace view public.v_chamados_diario   as select * from gold.chamados_diario;
create or replace view public.v_indicadores_gerais as select * from gold.indicadores_gerais;
create or replace view public.v_qualidade_ingestao as select * from gold.qualidade_ingestao;

revoke all on public.v_situacao_bairros, public.v_leituras_por_hora, public.v_chamados_diario,
              public.v_indicadores_gerais, public.v_qualidade_ingestao from anon, authenticated;
grant select on public.v_situacao_bairros, public.v_leituras_por_hora, public.v_chamados_diario,
                public.v_indicadores_gerais, public.v_qualidade_ingestao to anon, authenticated, service_role;
