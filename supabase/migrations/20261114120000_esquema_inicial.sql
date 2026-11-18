-- =====================================================================
-- ARCA — Alerta de Risco Climático e Apoio
-- Migração 1: esquema inicial
--
-- Organização em camadas (estilo data lake / medalhão):
--   bronze  → dado bruto, exatamente como chegou do sensor (jsonb)
--   silver  → dado validado, tipado e classificado
--   gold    → visões agregadas que alimentam o dashboard (migração 2)
--   public  → tabelas da aplicação (bairros, chamados, alertas, perfis)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists bronze;
create schema if not exists silver;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table public.bairros (
  id            smallserial primary key,
  nome          text not null unique,
  regiao        text not null,
  lat           numeric(9,6) not null,
  lng           numeric(9,6) not null,
  populacao     integer,
  -- 0 a 3: quantas vezes o bairro alagou em temporadas anteriores (peso no risco)
  historico_alagamento smallint not null default 0 check (historico_alagamento between 0 and 3)
);

create table public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  papel      text not null default 'cidadao' check (papel in ('cidadao', 'gestor')),
  bairro_id  smallint references public.bairros(id),
  criado_em  timestamptz not null default now()
);

create table public.sensores (
  id              text primary key,                    -- ex.: NIV-PAN-01
  bairro_id       smallint not null references public.bairros(id),
  tipo            text not null check (tipo in ('nivel', 'chuva')),
  unidade         text not null,                       -- cm | mm/h
  descricao       text,
  limite_atencao  numeric not null,
  limite_critico  numeric not null,
  ativo           boolean not null default true,
  check (limite_critico > limite_atencao)
);

-- ---------------------------------------------------------------------
-- Camada bronze: tudo que chega, sem descartar nada
-- ---------------------------------------------------------------------
create table bronze.leituras_brutas (
  id           bigserial primary key,
  origem       text not null,                 -- wokwi | simulador | seed
  payload      jsonb not null,
  recebida_em  timestamptz not null default now(),
  processada   boolean not null default false,
  erro         text                            -- motivo da rejeição, se houver
);
create index on bronze.leituras_brutas (recebida_em);

-- ---------------------------------------------------------------------
-- Camada silver: leituras válidas, tipadas e já classificadas
-- ---------------------------------------------------------------------
create table silver.leituras (
  id           bigserial primary key,
  bruta_id     bigint not null references bronze.leituras_brutas(id),
  sensor_id    text not null references public.sensores(id),
  bairro_id    smallint not null references public.bairros(id),
  tipo         text not null,
  valor        numeric not null,
  medida_em    timestamptz not null,
  nivel_risco  text not null check (nivel_risco in ('normal', 'atencao', 'critico'))
);
create index on silver.leituras (sensor_id, medida_em desc);
create index on silver.leituras (bairro_id, medida_em desc);

-- ---------------------------------------------------------------------
-- Chamados de zeladoria (o cidadão aponta o risco)
-- ---------------------------------------------------------------------
create sequence public.chamado_protocolo_seq start 1000;

create table public.chamados (
  id                  uuid primary key default gen_random_uuid(),
  protocolo           text not null unique
                        default 'ARCA-' || lpad(nextval('public.chamado_protocolo_seq')::text, 6, '0'),
  autor_id            uuid references auth.users(id) on delete set null,
  bairro_id           smallint not null references public.bairros(id),
  tipo_informado      text not null check (tipo_informado in
                        ('bueiro_obstruido', 'lixo_acumulado', 'corrego_assoreado', 'alagamento_ativo', 'outro')),
  descricao           text not null check (char_length(descricao) between 10 and 1000),
  referencia          text check (char_length(referencia) <= 200),
  lat                 numeric(9,6),
  lng                 numeric(9,6),
  foto_path           text,
  -- resultado da IA
  ia_categoria        text check (ia_categoria in
                        ('bueiro_obstruido', 'lixo_acumulado', 'corrego_assoreado', 'alagamento_ativo', 'sem_risco')),
  ia_confianca        numeric(4,3) check (ia_confianca between 0 and 1),
  ia_justificativa    text,
  ia_modo             text check (ia_modo in ('gemini', 'regras')),
  prioridade_score    smallint check (prioridade_score between 0 and 100),
  prioridade          text check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  -- ciclo de vida
  status              text not null default 'aberto' check (status in
                        ('aberto', 'em_analise', 'em_atendimento', 'resolvido', 'descartado')),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  resolvido_em        timestamptz
);
create index on public.chamados (status, prioridade_score desc);
create index on public.chamados (bairro_id, criado_em desc);
create index on public.chamados (autor_id);

create table public.chamado_historico (
  id               bigserial primary key,
  chamado_id       uuid not null references public.chamados(id) on delete cascade,
  status_anterior  text,
  status_novo      text not null,
  alterado_por     uuid references auth.users(id) on delete set null,
  observacao       text,
  criado_em        timestamptz not null default now()
);
create index on public.chamado_historico (chamado_id, criado_em);

-- ---------------------------------------------------------------------
-- Alertas publicados para a população
-- ---------------------------------------------------------------------
create table public.alertas (
  id            uuid primary key default gen_random_uuid(),
  bairro_id     smallint not null references public.bairros(id),
  nivel         text not null check (nivel in ('atencao', 'critico')),
  origem        text not null check (origem in ('sensor', 'chamado', 'manual')),
  sensor_id     text references public.sensores(id),
  chamado_id    uuid references public.chamados(id) on delete set null,
  titulo        text not null,
  mensagem      text not null,
  gerado_por    text not null default 'modelo' check (gerado_por in ('gemini', 'modelo', 'gestor')),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  encerrado_em  timestamptz
);
create index on public.alertas (bairro_id, ativo, criado_em desc);
-- no máximo um alerta ativo por bairro e nível (evita spam de alerta a cada leitura)
create unique index alertas_um_ativo_por_bairro_nivel
  on public.alertas (bairro_id, nivel) where ativo;

-- =====================================================================
-- Funções e gatilhos
-- =====================================================================

-- Cria o perfil automaticamente quando alguém se cadastra
create function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Usuário logado é gestor?
create function public.is_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'gestor');
$$;

-- Registra toda mudança de status no histórico e mantém as datas
create function public.registrar_mudanca_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chamado_historico (chamado_id, status_anterior, status_novo, alterado_por, criado_em)
    values (new.id, null, new.status, new.autor_id, new.criado_em);
    return new;
  end if;

  new.atualizado_em := now();
  if new.status is distinct from old.status then
    if new.status = 'resolvido' then
      new.resolvido_em := now();
    elsif old.status = 'resolvido' then
      new.resolvido_em := null;
    end if;
    insert into public.chamado_historico (chamado_id, status_anterior, status_novo, alterado_por)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger chamado_status_insert
  after insert on public.chamados
  for each row execute function public.registrar_mudanca_status();

create trigger chamado_status_update
  before update on public.chamados
  for each row execute function public.registrar_mudanca_status();

-- ---------------------------------------------------------------------
-- Pipeline de ingestão: bronze → silver em uma única chamada
-- Recebe o payload do sensor, guarda bruto, valida, tipa e classifica.
-- Retorna o resultado para a API decidir se emite alerta.
-- ---------------------------------------------------------------------
create function public.ingerir_leitura(p_origem text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, bronze, silver as $$
declare
  v_bruta_id   bigint;
  v_sensor     public.sensores%rowtype;
  v_valor      numeric;
  v_medida_em  timestamptz;
  v_risco      text;
  v_erro       text;
begin
  insert into bronze.leituras_brutas (origem, payload)
  values (coalesce(p_origem, 'desconhecida'), p_payload)
  returning id into v_bruta_id;

  -- validação
  select * into v_sensor from public.sensores where id = p_payload ->> 'sensor_id';
  if not found then
    v_erro := 'sensor_desconhecido';
  elsif not v_sensor.ativo then
    v_erro := 'sensor_inativo';
  else
    begin
      v_valor := (p_payload ->> 'valor')::numeric;
      v_medida_em := coalesce((p_payload ->> 'medida_em')::timestamptz, now());
    exception when others then
      v_erro := 'formato_invalido';
    end;
  end if;

  if v_erro is null then
    if v_valor is null then
      v_erro := 'valor_ausente';
    elsif v_sensor.tipo = 'nivel' and (v_valor < 0 or v_valor > 500) then
      v_erro := 'fora_da_faixa';          -- nível do córrego entre 0 e 500 cm
    elsif v_sensor.tipo = 'chuva' and (v_valor < 0 or v_valor > 200) then
      v_erro := 'fora_da_faixa';          -- chuva entre 0 e 200 mm/h
    elsif v_medida_em > now() + interval '5 minutes' then
      v_erro := 'data_no_futuro';
    end if;
  end if;

  if v_erro is not null then
    update bronze.leituras_brutas set processada = true, erro = v_erro where id = v_bruta_id;
    return jsonb_build_object('ok', false, 'bruta_id', v_bruta_id, 'erro', v_erro);
  end if;

  v_risco := case
    when v_valor >= v_sensor.limite_critico then 'critico'
    when v_valor >= v_sensor.limite_atencao then 'atencao'
    else 'normal'
  end;

  insert into silver.leituras (bruta_id, sensor_id, bairro_id, tipo, valor, medida_em, nivel_risco)
  values (v_bruta_id, v_sensor.id, v_sensor.bairro_id, v_sensor.tipo, v_valor, v_medida_em, v_risco);

  update bronze.leituras_brutas set processada = true where id = v_bruta_id;

  return jsonb_build_object(
    'ok', true, 'bruta_id', v_bruta_id, 'sensor_id', v_sensor.id,
    'bairro_id', v_sensor.bairro_id, 'tipo', v_sensor.tipo,
    'valor', v_valor, 'nivel_risco', v_risco
  );
end $$;

-- =====================================================================
-- Segurança: RLS (Row Level Security)
-- =====================================================================
alter table public.bairros            enable row level security;
alter table public.perfis             enable row level security;
alter table public.sensores           enable row level security;
alter table public.chamados           enable row level security;
alter table public.chamado_historico  enable row level security;
alter table public.alertas            enable row level security;

-- Dados públicos: qualquer pessoa vê bairros, sensores e alertas
create policy "bairros visiveis a todos"  on public.bairros  for select using (true);
create policy "sensores visiveis a todos" on public.sensores for select using (true);
create policy "alertas visiveis a todos"  on public.alertas  for select using (true);
create policy "gestor gerencia alertas"   on public.alertas  for all
  to authenticated using (public.is_gestor()) with check (public.is_gestor());

-- Perfis: cada um vê o seu; gestor vê todos
create policy "ver proprio perfil" on public.perfis for select
  to authenticated using (id = auth.uid() or public.is_gestor());
create policy "editar proprio perfil" on public.perfis for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- o cidadão só pode mudar nome e bairro, nunca o próprio papel
revoke update on public.perfis from anon, authenticated;
grant  update (nome, bairro_id) on public.perfis to authenticated;

-- Chamados: cidadão abre e vê os seus; gestor vê e atualiza todos
grant usage on sequence public.chamado_protocolo_seq to authenticated;
create policy "cidadao abre chamado" on public.chamados for insert
  to authenticated with check (autor_id = auth.uid());
create policy "ver chamados" on public.chamados for select
  to authenticated using (autor_id = auth.uid() or public.is_gestor());
create policy "gestor atualiza chamado" on public.chamados for update
  to authenticated using (public.is_gestor()) with check (public.is_gestor());

create policy "ver historico" on public.chamado_historico for select
  to authenticated using (
    public.is_gestor() or exists (
      select 1 from public.chamados c where c.id = chamado_id and c.autor_id = auth.uid()));

-- Camadas bronze/silver não são expostas pela API; só a função de ingestão escreve nelas
revoke all on schema bronze, silver from anon, authenticated;
revoke execute on function public.ingerir_leitura(text, jsonb) from public, anon, authenticated;
grant  execute on function public.ingerir_leitura(text, jsonb) to service_role;

-- =====================================================================
-- Storage: fotos dos chamados
-- Bucket privado, só imagens, até 5 MB (validação no próprio servidor de arquivos)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-chamados', 'fotos-chamados', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- cada usuário só grava na própria pasta: <uid>/<arquivo>
create policy "cidadao envia foto" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'fotos-chamados' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ver fotos" on storage.objects for select
  to authenticated using (
    bucket_id = 'fotos-chamados'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_gestor()));
