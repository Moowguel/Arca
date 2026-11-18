-- =====================================================================
-- ARCA — Migração 2: camada gold (indicadores para o dashboard)
--
-- Visões agregadas, sem dado pessoal, prontas para consumo.
-- Funções analíticas usadas: janelas (AVG OVER, LAG, ROW_NUMBER),
-- agregações condicionais (FILTER), percentuais e índice composto de risco.
-- As visões rodam com o dono (postgres): agregam chamados de todos os
-- cidadãos sem expor quem abriu cada um.
-- =====================================================================

create schema if not exists gold;

-- ---------------------------------------------------------------------
-- 1. Leituras por hora, com média móvel e variação
-- ---------------------------------------------------------------------
create view gold.leituras_por_hora as
with por_hora as (
  select
    l.bairro_id,
    l.tipo,
    date_trunc('hour', l.medida_em)                         as hora,
    round(avg(l.valor), 1)                                  as media,
    max(l.valor)                                            as maximo,
    count(*)                                                as qtd_leituras,
    count(*) filter (where l.nivel_risco = 'critico')       as qtd_criticas
  from silver.leituras l
  group by 1, 2, 3
)
select
  b.nome as bairro, b.regiao, p.*,
  round(avg(p.media) over w3, 1)                            as media_movel_3h,
  round(p.media - lag(p.media) over w, 1)                   as variacao_hora_anterior
from por_hora p
join public.bairros b on b.id = p.bairro_id
window
  w  as (partition by p.bairro_id, p.tipo order by p.hora),
  w3 as (partition by p.bairro_id, p.tipo order by p.hora rows between 2 preceding and current row);

-- ---------------------------------------------------------------------
-- 2. Situação atual de cada bairro + índice de risco (0 a 100)
--    O mesmo índice é usado pela IA para priorizar os chamados.
-- ---------------------------------------------------------------------
create view gold.situacao_bairros as
with ultima as (
  select distinct on (l.sensor_id)
    l.sensor_id, l.bairro_id, l.tipo, l.valor, l.medida_em, l.nivel_risco,
    s.limite_atencao, s.limite_critico
  from silver.leituras l
  join public.sensores s on s.id = l.sensor_id
  order by l.sensor_id, l.medida_em desc
),
chuva_24h as (
  -- leituras em mm/h: soma das médias horárias ≈ milímetros acumulados
  select bairro_id, round(sum(media), 1) as chuva_acumulada_24h
  from gold.leituras_por_hora
  where tipo = 'chuva' and hora >= now() - interval '24 hours'
  group by bairro_id
),
ch as (
  select bairro_id,
    count(*) filter (where status in ('aberto', 'em_analise', 'em_atendimento'))  as chamados_abertos,
    count(*) filter (where status in ('aberto', 'em_analise', 'em_atendimento')
                       and prioridade in ('alta', 'critica'))                    as chamados_graves_abertos
  from public.chamados group by bairro_id
),
al as (
  select bairro_id, count(*) as alertas_ativos, max(nivel) as pior_alerta
  from public.alertas where ativo group by bairro_id
),
base as (
  select
    b.id as bairro_id, b.nome as bairro, b.regiao, b.lat, b.lng, b.historico_alagamento,
    n.valor as nivel_cm, n.nivel_risco as risco_nivel, n.medida_em as nivel_medido_em,
    c.valor as chuva_mm_h, c.nivel_risco as risco_chuva,
    coalesce(c24.chuva_acumulada_24h, 0) as chuva_acumulada_24h,
    coalesce(ch.chamados_abertos, 0)        as chamados_abertos,
    coalesce(ch.chamados_graves_abertos, 0) as chamados_graves_abertos,
    coalesce(al.alertas_ativos, 0)          as alertas_ativos,
    -- componentes do índice
    least(coalesce(n.valor / nullif(n.limite_critico, 0), 0), 1) * 40                 as comp_nivel,
    least(coalesce(c.valor / nullif(c.limite_critico, 0), 0), 1) * 25                 as comp_chuva,
    least(coalesce(ch.chamados_graves_abertos, 0) * 5 + coalesce(ch.chamados_abertos, 0) * 2, 20) as comp_chamados,
    b.historico_alagamento * 5                                                          as comp_historico
  from public.bairros b
  left join ultima n   on n.bairro_id = b.id and n.tipo = 'nivel'
  left join ultima c   on c.bairro_id = b.id and c.tipo = 'chuva'
  left join chuva_24h c24 on c24.bairro_id = b.id
  left join ch  on ch.bairro_id = b.id
  left join al  on al.bairro_id = b.id
)
select
  base.*,
  round(comp_nivel + comp_chuva + comp_chamados + comp_historico)::int as indice_risco,
  case
    when comp_nivel + comp_chuva + comp_chamados + comp_historico >= 70 then 'critico'
    when comp_nivel + comp_chuva + comp_chamados + comp_historico >= 45 then 'alto'
    when comp_nivel + comp_chuva + comp_chamados + comp_historico >= 25 then 'moderado'
    else 'baixo'
  end as classificacao_risco,
  row_number() over (order by comp_nivel + comp_chuva + comp_chamados + comp_historico desc) as ranking
from base;

-- ---------------------------------------------------------------------
-- 3. Chamados por dia, bairro, categoria, prioridade e status
-- ---------------------------------------------------------------------
create view gold.chamados_diario as
select
  date_trunc('day', c.criado_em)::date                      as dia,
  b.nome                                                    as bairro,
  b.regiao,
  coalesce(c.ia_categoria, c.tipo_informado)                as categoria,
  coalesce(c.prioridade, 'sem_prioridade')                  as prioridade,
  c.status,
  count(*)                                                  as qtd,
  count(*) filter (where c.status = 'resolvido')            as resolvidos,
  round(avg(extract(epoch from (c.resolvido_em - c.criado_em)) / 3600)
        filter (where c.resolvido_em is not null), 1)       as horas_medias_resolucao,
  count(*) filter (where c.ia_modo is not null
                     and c.ia_categoria = c.tipo_informado) as ia_concordou_cidadao
from public.chamados c
join public.bairros b on b.id = c.bairro_id
group by 1, 2, 3, 4, 5, 6;

-- ---------------------------------------------------------------------
-- 4. Indicadores gerais (cartões do topo do dashboard)
-- ---------------------------------------------------------------------
create view gold.indicadores_gerais as
select
  (select count(*) from public.chamados
     where status in ('aberto', 'em_analise', 'em_atendimento'))                    as chamados_abertos,
  (select count(*) from public.chamados
     where status in ('aberto', 'em_analise', 'em_atendimento')
       and prioridade = 'critica')                                                  as chamados_criticos_abertos,
  (select round(avg(extract(epoch from (resolvido_em - criado_em)) / 3600), 1)
     from public.chamados
     where resolvido_em >= now() - interval '30 days')                             as horas_medias_resolucao_30d,
  (select round(100.0 * count(*) filter (where status = 'resolvido') / nullif(count(*), 0), 1)
     from public.chamados where criado_em >= now() - interval '30 days')           as taxa_resolucao_30d,
  (select count(*) from public.alertas where ativo)                                 as alertas_ativos,
  (select count(*) from gold.situacao_bairros
     where classificacao_risco in ('alto', 'critico'))                              as bairros_em_risco,
  (select count(*) from silver.leituras where medida_em >= now() - interval '24 hours') as leituras_24h;

-- ---------------------------------------------------------------------
-- 5. Qualidade da ingestão (quanto do dado bruto foi aproveitado)
-- ---------------------------------------------------------------------
create view gold.qualidade_ingestao as
select
  date_trunc('day', recebida_em)::date                                  as dia,
  origem,
  count(*)                                                              as recebidas,
  count(*) filter (where processada and erro is null)                   as aceitas,
  count(*) filter (where erro is not null)                              as rejeitadas,
  round(100.0 * count(*) filter (where erro is null) / count(*), 1)     as pct_aproveitamento,
  count(*) filter (where erro = 'fora_da_faixa')                        as erro_fora_da_faixa,
  count(*) filter (where erro = 'sensor_desconhecido')                  as erro_sensor_desconhecido,
  count(*) filter (where erro in ('formato_invalido', 'valor_ausente')) as erro_formato
from bronze.leituras_brutas
group by 1, 2;

-- Leitura pública da camada gold (dados agregados, sem dado pessoal)
grant usage  on schema gold to anon, authenticated, service_role;
grant select on all tables in schema gold to anon, authenticated, service_role;
