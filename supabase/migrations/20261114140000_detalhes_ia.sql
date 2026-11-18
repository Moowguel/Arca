-- ARCA — Migração 3: guarda a explicação da IA em cada chamado
-- (componentes da prioridade, modelo usado e tempo de triagem, para medir o ganho)
alter table public.chamados add column if not exists ia_detalhes jsonb;

comment on column public.chamados.ia_detalhes is
  'Explicação da triagem automática: componentes do score, modelo, tempo em ms e entradas usadas';
