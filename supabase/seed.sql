-- =====================================================================
-- ARCA — dados de demonstração
-- Roda automaticamente no `supabase db reset`.
-- Gera 7 dias de leituras passando pelo pipeline real (bronze → silver),
-- incluindo três temporais e algumas leituras inválidas de propósito.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bairros (São Paulo) e sensores: 1 de nível + 1 de chuva por bairro
-- ---------------------------------------------------------------------
insert into public.bairros (id, nome, regiao, lat, lng, historico_alagamento) values
  (1, 'Jardim Pantanal',  'Leste',   -23.497500, -46.434500, 3),
  (2, 'Itaim Paulista',   'Leste',   -23.501000, -46.399000, 2),
  (3, 'Vila Prudente',    'Sudeste', -23.586000, -46.582000, 2),
  (4, 'Ipiranga',         'Sudeste', -23.589000, -46.606000, 2),
  (5, 'Lapa',             'Oeste',   -23.523000, -46.704000, 1),
  (6, 'Jardim Ângela',    'Sul',     -23.712000, -46.768000, 1);
select setval('public.bairros_id_seq', 6);

insert into public.sensores (id, bairro_id, tipo, unidade, descricao, limite_atencao, limite_critico)
select 'NIV-' || lpad(b.id::text, 2, '0'), b.id, 'nivel', 'cm',
       'Ultrassônico HC-SR04 sobre o córrego — ' || b.nome, 150, 220
from public.bairros b
union all
select 'CHU-' || lpad(b.id::text, 2, '0'), b.id, 'chuva', 'mm/h',
       'Pluviômetro — ' || b.nome, 15, 30
from public.bairros b;

-- ---------------------------------------------------------------------
-- Usuários de demonstração (senha: arca1234)
--   gestor@arca.dev   → painel do gestor
--   cidadao@arca.dev  → abre e acompanha chamados
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated',
   'authenticated', 'gestor@arca.dev', extensions.crypt('arca1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Gestora Defesa Civil"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated',
   'authenticated', 'cidadao@arca.dev', extensions.crypt('arca1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"nome":"Maria Moradora"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in ('gestor@arca.dev', 'cidadao@arca.dev');

update public.perfis set papel = 'gestor' where id = '11111111-1111-1111-1111-111111111111';
update public.perfis set bairro_id = 1    where id = '22222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------
-- 7 dias de leituras a cada 30 min, simulando três temporais:
--   há ~50h (forte), há ~26h (moderado) e agora (em andamento)
-- O nível do córrego responde à chuva com atraso e depois escoa.
-- ---------------------------------------------------------------------
do $$
declare
  fator   numeric[] := array[1.25, 1.10, 0.90, 0.85, 0.60, 0.70];  -- quanto cada bairro sente a chuva
  nivel   numeric[] := array[60, 60, 60, 60, 60, 60];
  base    constant numeric := 60;
  t       timestamptz;
  h       numeric;          -- horas até agora (negativo = passado)
  chuva   numeric;
  i       int;
begin
  perform setseed(0.42);
  t := date_trunc('hour', now()) - interval '7 days';

  while t <= now() loop
    h := extract(epoch from (t - now())) / 3600;

    for i in 1..6 loop
      chuva := 48 * exp(-power((h + 50) / 2.0, 2))
             + 20 * exp(-power((h + 26) / 1.5, 2))
             + 22 * exp(-power((h + 0.5) / 1.5, 2));
      chuva := greatest(0, round(chuva * fator[i] + (random()::numeric - 0.6) * 1.5, 1));

      nivel[i] := nivel[i] + chuva * 0.9 - (nivel[i] - base) * 0.08 + (random()::numeric - 0.5) * 2;
      nivel[i] := least(greatest(nivel[i], 20), 480);

      perform public.ingerir_leitura('seed', jsonb_build_object(
        'sensor_id', 'CHU-' || lpad(i::text, 2, '0'), 'valor', chuva, 'medida_em', t));
      perform public.ingerir_leitura('seed', jsonb_build_object(
        'sensor_id', 'NIV-' || lpad(i::text, 2, '0'), 'valor', round(nivel[i], 1), 'medida_em', t));
    end loop;

    -- ~1 leitura defeituosa a cada 3 horas, para o painel de qualidade ter o que mostrar
    if random() < 0.17 then
      perform public.ingerir_leitura('seed', case floor(random() * 3)::int
        when 0 then jsonb_build_object('sensor_id', 'NIV-03', 'valor', -12, 'medida_em', t)
        when 1 then jsonb_build_object('sensor_id', 'NIV-99', 'valor', 80, 'medida_em', t)
        else        jsonb_build_object('sensor_id', 'CHU-02', 'valor', 'erro_leitura', 'medida_em', t)
      end);
    end if;

    t := t + interval '30 minutes';
  end loop;
end $$;

-- no seed, a "hora de chegada" do dado bruto é a própria hora da medição
update bronze.leituras_brutas
   set recebida_em = (payload ->> 'medida_em')::timestamptz
 where origem = 'seed' and payload ? 'medida_em';

-- ---------------------------------------------------------------------
-- Chamados históricos (14 dias), com histórico de status coerente
-- ---------------------------------------------------------------------
alter table public.chamados disable trigger chamado_status_insert;

do $$
declare
  tipos  text[] := array['bueiro_obstruido', 'lixo_acumulado', 'corrego_assoreado', 'alagamento_ativo', 'outro'];
  descr  text[] := array[
    'Bueiro totalmente tampado por folhas e terra na esquina, a água já empoça com pouca chuva.',
    'Muito lixo e entulho jogado na calçada perto da boca de lobo, sacos rasgados espalhados.',
    'Córrego cheio de terra e mato, a água está quase no nível da margem.',
    'Rua alagada, a água está entrando nas casas e os carros não passam.',
    'Grade de drenagem quebrada e solta no meio da via, risco de acidente.'];
  peso_bairro int[] := array[1,1,1,1,1,1,1,1, 2,2,2,2,2, 3,3,3, 4,4,4, 5,5, 6,6];
  pri    text[] := array['baixa', 'media', 'alta', 'critica'];
  v_id   uuid;
  v_tipo int;
  v_ia   text;
  v_score int;
  v_pri  text;
  v_status text;
  v_criado timestamptz;
  v_resolv timestamptz;
  v_bairro int;
  n      int;
begin
  perform setseed(0.7);
  for n in 1..48 loop
    v_bairro := peso_bairro[1 + floor(random() * array_length(peso_bairro, 1))::int];
    v_tipo   := 1 + floor(random() * 5)::int;
    -- a IA concorda com o cidadão na maioria das vezes
    v_ia     := case when random() < 0.83 then tipos[v_tipo]
                     when v_tipo = 5 then 'sem_risco'
                     else tipos[1 + floor(random() * 4)::int] end;
    if v_ia = 'outro' then v_ia := 'sem_risco'; end if;
    v_score  := least(100, greatest(5,
                  case v_ia when 'alagamento_ativo' then 70 when 'corrego_assoreado' then 55
                            when 'bueiro_obstruido' then 45 when 'lixo_acumulado' then 35 else 10 end
                  + (3 - v_bairro / 2) * 4 + floor(random() * 15)::int));
    v_pri    := case when v_score >= 75 then 'critica' when v_score >= 55 then 'alta'
                     when v_score >= 30 then 'media' else 'baixa' end;
    v_criado := now() - (random() * interval '14 days');

    v_status := case
      when v_criado < now() - interval '5 days' then (array['resolvido','resolvido','resolvido','descartado'])[1 + floor(random()*4)::int]
      when v_criado < now() - interval '2 days' then (array['resolvido','em_atendimento','em_analise','aberto'])[1 + floor(random()*4)::int]
      else (array['aberto','aberto','em_analise'])[1 + floor(random()*3)::int]
    end;
    v_resolv := case when v_status = 'resolvido'
                     then v_criado + ((case v_pri when 'critica' then 6 when 'alta' then 18
                                                 when 'media' then 40 else 70 end)
                                      * (0.6 + random())) * interval '1 hour' end;
    if v_resolv > now() then v_resolv := now() - interval '10 minutes'; end if;

    insert into public.chamados (autor_id, bairro_id, tipo_informado, descricao, referencia, lat, lng,
                                 ia_categoria, ia_confianca, ia_justificativa, ia_modo,
                                 prioridade_score, prioridade, status, criado_em, atualizado_em, resolvido_em)
    select case when n % 6 = 0 then '22222222-2222-2222-2222-222222222222'::uuid end,
           b.id, tipos[v_tipo], descr[v_tipo], 'Próximo ao número ' || (100 + floor(random()*900)::int),
           b.lat + (random() - 0.5) * 0.01, b.lng + (random() - 0.5) * 0.01,
           v_ia, round((0.62 + random() * 0.35)::numeric, 3),
           'Classificação gerada a partir da descrição e do risco do bairro (dados de demonstração).',
           'regras', v_score, v_pri, v_status, v_criado, coalesce(v_resolv, v_criado), v_resolv
    from public.bairros b where b.id = v_bairro
    returning id into v_id;

    insert into public.chamado_historico (chamado_id, status_anterior, status_novo, criado_em)
    values (v_id, null, 'aberto', v_criado);
    if v_status <> 'aberto' then
      insert into public.chamado_historico (chamado_id, status_anterior, status_novo, alterado_por, criado_em)
      values (v_id, 'aberto', 'em_analise', '11111111-1111-1111-1111-111111111111', v_criado + interval '40 minutes');
    end if;
    if v_status in ('em_atendimento', 'resolvido') then
      insert into public.chamado_historico (chamado_id, status_anterior, status_novo, alterado_por, criado_em)
      values (v_id, 'em_analise', 'em_atendimento', '11111111-1111-1111-1111-111111111111',
              coalesce(v_criado + (v_resolv - v_criado) / 2, v_criado + interval '3 hours'));
    end if;
    if v_status in ('resolvido', 'descartado') then
      insert into public.chamado_historico (chamado_id, status_anterior, status_novo, alterado_por, criado_em)
      values (v_id, case v_status when 'resolvido' then 'em_atendimento' else 'em_analise' end, v_status,
              '11111111-1111-1111-1111-111111111111', coalesce(v_resolv, v_criado + interval '2 hours'));
    end if;
  end loop;
end $$;

alter table public.chamados enable trigger chamado_status_insert;

-- fotos de demonstração (Wikimedia Commons; créditos na tabela fotos_demonstracao)
update public.chamados c
   set foto_url = (
     select f.url from public.fotos_demonstracao f
      where f.categoria = case
              when coalesce(c.ia_categoria, c.tipo_informado) in ('sem_risco', 'outro') then 'outro'
              else coalesce(c.ia_categoria, c.tipo_informado) end
      order by md5(c.id::text || f.arquivo) limit 1)
 where c.foto_path is null and c.foto_url is null;

-- ---------------------------------------------------------------------
-- Alertas: o temporal de ~50h atrás (já encerrado) e o atual
-- ---------------------------------------------------------------------
insert into public.alertas (bairro_id, nivel, origem, sensor_id, titulo, mensagem, gerado_por, ativo, criado_em, encerrado_em)
values
  (1, 'critico', 'sensor', 'NIV-01', 'Córrego transbordando no Jardim Pantanal',
   'O nível do córrego passou do limite crítico. Evite a região próxima às margens, desligue a energia se a água entrar em casa e procure um local alto.',
   'modelo', false, now() - interval '49 hours', now() - interval '40 hours'),
  (2, 'atencao', 'sensor', 'NIV-02', 'Nível do córrego subindo no Itaim Paulista',
   'Chuva forte na região. O córrego está acima do normal. Evite deixar carros perto das margens.',
   'modelo', false, now() - interval '49 hours', now() - interval '43 hours');

-- o alerta atual é derivado da última leitura real do pipeline
insert into public.alertas (bairro_id, nivel, origem, sensor_id, titulo, mensagem, gerado_por, criado_em)
select s.bairro_id, s.risco, 'sensor', s.sensor_id,
       case s.risco when 'critico' then 'Risco de alagamento agora em ' else 'Atenção: chuva forte em ' end || b.nome,
       case s.risco
         when 'critico' then 'Os sensores indicam risco alto de alagamento. Evite sair de casa, fique longe de córregos e bueiros e acompanhe os alertas.'
         else 'Chuva forte e nível do córrego subindo. Evite áreas baixas e não atravesse ruas alagadas.' end,
       'modelo', now() - interval '20 minutes'
from (
  select distinct on (l.bairro_id) l.bairro_id, l.sensor_id, l.nivel_risco as risco
  from silver.leituras l
  where l.medida_em >= now() - interval '1 hour' and l.nivel_risco <> 'normal'
  order by l.bairro_id, case l.nivel_risco when 'critico' then 0 else 1 end, l.medida_em desc
) s
join public.bairros b on b.id = s.bairro_id;
