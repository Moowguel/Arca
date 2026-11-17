-- ARCA — Migração 5: o gestor pode anotar uma observação na mudança de status
create policy "gestor anota historico" on public.chamado_historico for update
  to authenticated using (public.is_gestor()) with check (public.is_gestor());
revoke update on public.chamado_historico from anon, authenticated;
grant  update (observacao) on public.chamado_historico to authenticated;
