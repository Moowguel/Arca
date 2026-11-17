-- =====================================================================
-- ARCA — Migração 6: fotos de demonstração (Wikimedia Commons)
-- Chamados podem ter uma foto externa (foto_url) além da foto enviada
-- ao Storage (foto_path). As imagens de demonstração são de licença livre,
-- com autor e página de origem registrados para os créditos.
-- =====================================================================
alter table public.chamados
  add column if not exists foto_url text check (foto_url ~ '^https://');

create table if not exists public.fotos_demonstracao (
  id         smallserial primary key,
  categoria  text not null,
  arquivo    text not null unique,   -- nome do arquivo no Wikimedia Commons
  autor      text not null,
  url        text generated always as (
               'https://commons.wikimedia.org/wiki/Special:FilePath/' || replace(arquivo, ' ', '_') || '?width=900'
             ) stored,
  pagina     text generated always as (
               'https://commons.wikimedia.org/wiki/File:' || replace(arquivo, ' ', '_')
             ) stored
);
alter table public.fotos_demonstracao enable row level security;
create policy "creditos visiveis a todos" on public.fotos_demonstracao for select using (true);

insert into public.fotos_demonstracao (categoria, arquivo, autor) values
  ('alagamento_ativo',  'Enchente Blumenau 2008 Rua Amazonas.jpg',                 'Cristian Janke'),
  ('alagamento_ativo',  'Enchentes RS - 2024.jpg',                                 'Lechatjaune'),
  ('alagamento_ativo',  'Rua alagada no Centro Histórico de Paraty RJ.jpg',        'Nelson Alexandre Brolese'),
  ('alagamento_ativo',  'Enchente Vila Guilherme.jpg',                             'ver página do arquivo'),
  ('bueiro_obstruido',  'Litter in a stormwater drain in Wellington.jpg',          'Marshelec'),
  ('bueiro_obstruido',  'Storm drain grate in Seminole, Florida.jpg',              'Philipp Michel Reichold'),
  ('bueiro_obstruido',  'Storm Drain.JPG',                                         'Robert Lawton'),
  ('lixo_acumulado',    'Lixo na rua.jpg',                                         'jmerelo (Flickr)'),
  ('lixo_acumulado',    'Basura acumulada en via publica.jpg',                     'C GatoNegro'),
  ('lixo_acumulado',    'Terreno Abandonado.jpg',                                  'ver página do arquivo'),
  ('corrego_assoreado', 'Córrego em favela (17279725116).jpg',                     'ver página do arquivo'),
  ('corrego_assoreado', '1078Garbage-plastic pollution in Marilao River 07.jpg',   'JFVelasquez Floro'),
  ('corrego_assoreado', 'POLLUTED WATER.jpg',                                      'ver página do arquivo'),
  ('outro',             'Curb gutter storm drain.JPG',                             'Robert Lawton')
on conflict (arquivo) do nothing;

-- distribui as fotos entre os chamados de demonstração já existentes
update public.chamados c
   set foto_url = (
     select f.url from public.fotos_demonstracao f
      where f.categoria = coalesce(nullif(c.tipo_informado, 'outro'), 'outro')
      order by md5(c.id::text || f.arquivo) limit 1)
 where c.foto_path is null and c.foto_url is null
   and c.ia_justificativa like '%dados de demonstração%';
