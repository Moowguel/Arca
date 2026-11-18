-- =====================================================================
-- ARCA — Migração 8: diário de atendimento
-- Cada passo do serviço em campo (a caminho, chegada, execução, conclusão,
-- saída, anotações) com hora, equipe e quem registrou. Notas internas
-- ficam visíveis só para a equipe; o resto aparece para o morador.
-- =====================================================================
create table public.chamado_andamento (
  id               bigserial primary key,
  chamado_id       uuid not null references public.chamados(id) on delete cascade,
  tipo             text not null check (tipo in
                     ('a_caminho', 'chegada', 'execucao', 'concluido', 'saida', 'nota')),
  descricao        text check (char_length(descricao) <= 1000),
  equipe           text check (char_length(equipe) <= 80),
  visivel_cidadao  boolean not null default true,
  registrado_por   uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index on public.chamado_andamento (chamado_id, criado_em);

alter table public.chamado_andamento enable row level security;

-- equipe registra e vê tudo
create policy "gestor registra andamento" on public.chamado_andamento for insert
  to authenticated with check (public.is_gestor() and registrado_por = auth.uid());
create policy "gestor ve andamento" on public.chamado_andamento for select
  to authenticated using (public.is_gestor());
-- morador vê só o que é público, e só dos próprios chamados
create policy "morador ve andamento publico" on public.chamado_andamento for select
  to authenticated using (
    visivel_cidadao and exists (
      select 1 from public.chamados c where c.id = chamado_id and c.autor_id = auth.uid()));

grant select, insert on public.chamado_andamento to authenticated;
grant usage on sequence public.chamado_andamento_id_seq to authenticated;

-- nome de quem registrou, para a linha do tempo (gestor vê perfis de todos)
comment on table public.chamado_andamento is 'Diário de atendimento em campo de cada chamado';
