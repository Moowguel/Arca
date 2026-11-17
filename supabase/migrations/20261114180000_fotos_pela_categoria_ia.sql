-- ARCA — Migração 7: a foto de demonstração segue a categoria exibida (a da IA)
update public.chamados c
   set foto_url = (
     select f.url from public.fotos_demonstracao f
      where f.categoria = case
              when coalesce(c.ia_categoria, c.tipo_informado) in ('sem_risco', 'outro') then 'outro'
              else coalesce(c.ia_categoria, c.tipo_informado) end
      order by md5(c.id::text || f.arquivo) limit 1)
 where c.foto_path is null and c.foto_url like 'https://commons.wikimedia.org/%';
