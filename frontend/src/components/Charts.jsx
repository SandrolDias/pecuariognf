import React from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import TooltipInfo from './TooltipInfo'

const PALETTE = [
  '#10b981','#3b82f6','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#ec4899','#84cc16',
  '#f97316','#6366f1',
]

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: 12,
  },
  itemStyle: { color: '#94a3b8' },
}

const TICK = { fill: '#94a3b8', fontSize: 11 }
const GRID = { strokeDasharray: '3 3', stroke: '#1e293b' }

function ChartCard({ title, icon, children, span2 = false, info }) {
  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl p-5 ${span2 ? 'lg:col-span-2' : ''}`}>
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        {info && <TooltipInfo definition={info} />}
      </h3>
      {children}
    </div>
  )
}

const fmtBRL = (v) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `R$ ${(v / 1_000).toFixed(1)}k`
  : `R$ ${v}`

const fmtNum = (v) => (v ?? 0).toLocaleString('pt-BR')

export default function Charts({ chartData, chartTitles = {}, granularity = 'monthly', metricDefinitions = {}, categoryVarSummary = {}, ageCatSummary = {} }) {
  if (!chartData) return null

  const {
    movimentacao_mensal      = [],
    ent_sai_mensal           = [],
    evolucao_acumulada       = [],
    por_categoria            = [],
    por_fazenda              = [],
    por_lote                 = [],
    peso_medio_por_lote      = [],
    valor_mensal             = [],
    valor_por_lote           = [],
    saidas_por_evento        = [],
    peso_evolucao            = [],
    peso_medio_por_categoria = [],
    category_variation       = [],
    transition_matrix        = [],
    age_category_changes     = [],
    por_categoria_entrada    = [],
    age_changes_timeline     = [],
    peso_evolucao_evento     = [],
  } = chartData

  const isWeekly = granularity === 'weekly'

  // Dynamic titles from backend (with defaults)
  const T = {
    movimentacao: chartTitles.movimentacao || (isWeekly ? 'Evolução Semanal do Rebanho' : 'Evolução Mensal do Rebanho'),
    ent_sai:      chartTitles.ent_sai      || (isWeekly ? 'Entradas × Saídas por Semana' : 'Entradas × Saídas por Mês'),
    valor:        chartTitles.valor        || (isWeekly ? 'Valor Movimentado por Semana' : 'Valor Movimentado por Mês'),
  }

  const hasData = (...arrs) => arrs.some((a) => a && a.length > 0)

  if (!hasData(evolucao_acumulada, movimentacao_mensal, ent_sai_mensal, por_categoria, por_fazenda, category_variation)) {
    return (
      <div className="text-center py-10 text-slate-500">
        <div className="text-4xl mb-3">📉</div>
        Dados insuficientes para exibir gráficos.
      </div>
    )
  }

  // Normalize periodo key (backend may return 'periodo' or 'mes_ano'/'semana_ano')
  const periodoKey = (movimentacao_mensal[0] && 'periodo' in movimentacao_mensal[0])
    ? 'periodo'
    : isWeekly ? 'semana_ano' : 'mes_ano'
  const esKey = (ent_sai_mensal[0] && 'periodo' in ent_sai_mensal[0])
    ? 'periodo'
    : isWeekly ? 'semana_ano' : 'mes_ano'

  return (
    <div className="fade-in">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span>📈</span> Gráficos e Análises
        <span className="ml-auto text-xs text-slate-500 font-normal">
          {isWeekly ? '📅 Visualização Semanal' : '📆 Visualização Mensal'}
        </span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Evolução acumulada do rebanho */}
        {evolucao_acumulada.length > 0 && (
          <ChartCard
            title={T.movimentacao}
            icon="📅"
            span2={evolucao_acumulada.length > 6}
            info={metricDefinitions?.evolucao_rebanho}
          >
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolucao_acumulada}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="periodo" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v, name) => [fmtNum(v), name]}
                  labelFormatter={(label) => `Período: ${label}`}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                <Line
                  type="monotone" dataKey="saldo_acumulado"
                  stroke="#10b981" strokeWidth={2}
                  dot={{ fill: '#10b981', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Saldo Acumulado"
                />
                <Line
                  type="monotone" dataKey="saldo_periodo"
                  stroke="#3b82f6" strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  name="Saldo do Período"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 2. Entradas × Saídas */}
        {ent_sai_mensal.length > 0 && (
          <ChartCard title={T.ent_sai} icon="↕️">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={ent_sai_mensal}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey={esKey} tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                <Bar dataKey="entrada" fill="#10b981" name="Entradas" radius={[4,4,0,0]} />
                <Bar dataKey="saida"   fill="#ef4444" name="Saídas"   radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 3. Por Categoria Calculada — PieChart */}
        {por_categoria.length > 0 && (
          <ChartCard title="Animais por Categoria" icon="🐃">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={por_categoria}
                  dataKey="quantidade"
                  nameKey="categoria"
                  cx="50%" cy="50%"
                  outerRadius={90}
                  label={({ categoria, percent }) =>
                    `${String(categoria ?? '').slice(0, 14)} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {por_categoria.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [fmtNum(v), 'Animais']}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 4. Saídas por Evento */}
        {saidas_por_evento.length > 0 && (
          <ChartCard title="Saídas por Tipo de Evento" icon="📤">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={saidas_por_evento} layout="vertical">
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} />
                <YAxis type="category" dataKey="evento" tick={{ ...TICK, fontSize: 10 }} width={110} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmtNum(v), 'Animais']} />
                <Bar dataKey="quantidade" fill="#ef4444" name="Saídas" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 5. Por fazenda */}
        {por_fazenda.length > 0 && (
          <ChartCard title="Animais por Fazenda" icon="🏡">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={por_fazenda} layout="vertical">
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} />
                <YAxis type="category" dataKey="fazenda" tick={TICK} width={90} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmtNum(v), 'Animais']} />
                <Bar dataKey="quantidade" fill="#3b82f6" name="Animais" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 6. Ranking de lotes (top 10) */}
        {por_lote.length > 0 && (
          <ChartCard title="Ranking de Lotes — Top 10" icon="🏆">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={por_lote.slice(0, 10)} layout="vertical">
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} />
                <YAxis type="category" dataKey="lote" tick={TICK} width={80} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmtNum(v), 'Animais']} />
                <Bar dataKey="quantidade" fill="#f59e0b" name="Animais" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 7. Peso médio por lote */}
        {peso_medio_por_lote.length > 0 && (
          <ChartCard title="Peso Médio por Lote" icon="⚖️">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={peso_medio_por_lote.slice(0, 12)}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="lote" tick={{ ...TICK, fontSize: 10 }} />
                <YAxis tick={TICK} unit=" kg" />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${fmtNum(v)} kg`, 'Peso Médio']} />
                <Bar dataKey="peso_medio" fill="#8b5cf6" name="Peso Médio (kg)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 8. Valor movimentado por período */}
        {valor_mensal.length > 0 && (
          <ChartCard title={T.valor} icon="💰" span2={valor_mensal.length > 6}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={valor_mensal}>
                <CartesianGrid {...GRID} />
                <XAxis
                  dataKey={(valor_mensal[0] && 'periodo' in valor_mensal[0]) ? 'periodo' : (isWeekly ? 'semana_ano' : 'mes_ano')}
                  tick={TICK}
                />
                <YAxis tick={TICK} tickFormatter={fmtBRL} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [`R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']}
                />
                <Bar dataKey="valor" fill="#22c55e" name="Valor (R$)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 9. Valor por lote */}
        {valor_por_lote.length > 0 && (
          <ChartCard title="Valor por Lote — Top 10" icon="💵">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={valor_por_lote.slice(0, 10)} layout="vertical">
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} tickFormatter={fmtBRL} />
                <YAxis type="category" dataKey="lote" tick={TICK} width={80} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [`R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']}
                />
                <Bar dataKey="valor_total" fill="#06b6d4" name="Valor (R$)" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 10. Evolução de peso por período */}
        {peso_evolucao.length > 0 && (() => {
          // Pivot long-format evento data to wide format for Recharts
          const eventTypes = [...new Set(peso_evolucao_evento.map(r => r.evento))].sort()
          const hasByEvent = eventTypes.length > 0

          // Build wide data: { periodo, [evento]: peso_medio, [evento]_n: quantidade }
          const wideData = peso_evolucao.map(row => {
            const wide = { periodo: row.periodo, _total: row.peso_medio, _total_n: row.quantidade }
            if (hasByEvent) {
              eventTypes.forEach(ev => {
                const match = peso_evolucao_evento.find(r => r.periodo === row.periodo && r.evento === ev)
                wide[ev]           = match ? match.peso_medio  : null
                wide[`${ev}_n`]    = match ? match.quantidade  : null
              })
            }
            return wide
          })

          const EVENT_COLORS = ['#8b5cf6','#10b981','#f59e0b','#3b82f6','#ef4444','#ec4899']

          return (
            <ChartCard
              title={`Evolução do Peso Médio por ${isWeekly ? 'Semana' : 'Mês'}`}
              icon="📊"
              span2={hasByEvent && eventTypes.length > 1}
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={wideData}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="periodo" tick={TICK} />
                  <YAxis tick={TICK} unit=" kg" />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload || {}
                      return (
                        <div style={TOOLTIP_STYLE.contentStyle}>
                          <p style={{ color: '#f1f5f9', marginBottom: 6, fontWeight: 600 }}>{label}</p>
                          {hasByEvent
                            ? eventTypes.map((ev, i) => row[ev] != null && (
                                <div key={ev} style={{ margin: '3px 0' }}>
                                  <p style={{ color: EVENT_COLORS[i % EVENT_COLORS.length], margin: 0 }}>
                                    {ev}: {fmtNum(row[ev])} kg
                                  </p>
                                  <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>
                                    &nbsp;&nbsp;↳ {fmtNum(row[`${ev}_n`])} animais
                                  </p>
                                </div>
                              ))
                            : <>
                                <p style={{ color: '#8b5cf6', margin: '2px 0' }}>Peso Médio: {fmtNum(row._total)} kg</p>
                                <p style={{ color: '#94a3b8', margin: '2px 0' }}>Animais: {fmtNum(row._total_n)}</p>
                              </>
                          }
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {hasByEvent
                    ? eventTypes.map((ev, i) => (
                        <Line
                          key={ev}
                          type="monotone"
                          dataKey={ev}
                          stroke={EVENT_COLORS[i % EVENT_COLORS.length]}
                          strokeWidth={2}
                          dot={{ fill: EVENT_COLORS[i % EVENT_COLORS.length], r: 4 }}
                          activeDot={{ r: 6 }}
                          name={ev}
                          connectNulls
                        />
                      ))
                    : <Line
                        type="monotone" dataKey="_total"
                        stroke="#8b5cf6" strokeWidth={2}
                        dot={{ fill: '#8b5cf6', r: 4 }}
                        activeDot={{ r: 6 }}
                        name="Peso Médio (kg)"
                      />
                  }
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )
        })()}

        {/* 11. Peso médio por categoria */}
        {peso_medio_por_categoria.length > 0 && (
          <ChartCard title="Peso Médio por Categoria" icon="🐄">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={peso_medio_por_categoria}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="categoria" tick={{ ...TICK, fontSize: 10 }} />
                <YAxis tick={TICK} unit=" kg" />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload || {}
                    return (
                      <div style={TOOLTIP_STYLE.contentStyle}>
                        <p style={{ color: '#f1f5f9', marginBottom: 6, fontWeight: 600 }}>{label}</p>
                        <p style={{ color: payload[0]?.fill || '#10b981', margin: '2px 0' }}>Peso Médio: {fmtNum(d.peso_medio)} kg</p>
                        <p style={{ color: '#94a3b8', margin: '2px 0' }}>Animais: {fmtNum(d.quantidade)}</p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="peso_medio" radius={[4,4,0,0]}>
                  {peso_medio_por_categoria.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 12. Variação de Animais por Categoria (NEW) */}
        {category_variation.length > 0 ? (
          <ChartCard
            title="Variação de Animais por Categoria"
            icon="🔄"
            span2
            info={metricDefinitions?.variacao_por_categoria}
          >
            {/* Subtitle */}
            <p className="text-slate-500 text-xs mb-3 -mt-2">
              Entradas e saídas de categoria calculadas pela mudança de idade do animal dentro do período selecionado.
              Chave: campo <span className="text-emerald-400 font-medium">ID / Brinco</span>.
            </p>

            <ResponsiveContainer width="100%" height={Math.max(200, category_variation.length * 52)}>
              <BarChart data={category_variation} layout="vertical" barGap={4}>
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="categoria"
                  tick={{ ...TICK, fontSize: 11 }}
                  width={160}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v, name) => [fmtNum(v), name]}
                />
                <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                <Bar dataKey="entradas"        fill="#10b981" name="Entradas"         radius={[0,4,4,0]} />
                <Bar dataKey="saidas"          fill="#ef4444" name="Saídas"           radius={[0,4,4,0]} />
                <Bar dataKey="variacao_liquida" fill="#3b82f6" name="Variação Líquida" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Analytical text */}
            {categoryVarSummary?.texto_analitico && (
              <div className="mt-4 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
                <p className="text-slate-400 text-xs leading-relaxed">
                  📊 {categoryVarSummary.texto_analitico}
                </p>
              </div>
            )}

            {/* Summary chips */}
            {categoryVarSummary?.total_ids_analisados > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-full">
                  🐄 {fmtNum(categoryVarSummary.total_ids_analisados)} IDs analisados
                </span>
                <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                  🔄 {fmtNum(categoryVarSummary.total_ids_com_mudanca)} mudaram de categoria
                </span>
                <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded-full">
                  ✓ {fmtNum(categoryVarSummary.total_ids_sem_mudanca)} sem mudança
                </span>
                {categoryVarSummary.total_registros_sem_id > 0 && (
                  <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-full border border-yellow-500/20">
                    ⚠️ {fmtNum(categoryVarSummary.total_registros_sem_id)} sem ID
                  </span>
                )}
              </div>
            )}
          </ChartCard>
        ) : categoryVarSummary?.aviso ? (
          /* Show warning when variation can't be calculated */
          <ChartCard title="Variação de Animais por Categoria" icon="🔄" span2>
            <div className="py-6 text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-yellow-400 text-sm font-medium">
                {categoryVarSummary.aviso}
              </p>
              <p className="text-slate-500 text-xs mt-2">
                O campo ID representa o brinco/identificação individual do animal
                e é obrigatório para esta análise.
              </p>
            </div>
          </ChartCard>
        ) : null}

        {/* 13. Transições de Categoria (chegaram → estão) — por brinco */}
        {transition_matrix.length > 0 && (
          <ChartCard title="Transições de Categoria (por Brinco)" icon="🔀" span2>
            <p className="text-slate-500 text-xs mb-3 -mt-2">
              Mudanças de categoria detectadas comparando o primeiro e o último registro do mesmo brinco.
              Chave: campo <span className="text-emerald-400 font-medium">ID / Brinco</span>.
            </p>
            <ResponsiveContainer width="100%" height={Math.max(180, Math.min(transition_matrix.length, 15) * 36)}>
              <BarChart data={transition_matrix.slice(0, 15)} layout="vertical" barSize={18}>
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ ...TICK, fontSize: 10 }}
                  width={175}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [fmtNum(v), 'Animais']}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="quantidade" name="Animais" radius={[0, 4, 4, 0]}>
                  {transition_matrix.slice(0, 15).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-slate-600 text-xs mt-2">
              Exibindo os {Math.min(transition_matrix.length, 15)} pares de transição mais frequentes
              {transition_matrix.length > 15 ? ` de ${transition_matrix.length} no total` : ''}.
            </p>
          </ChartCard>
        )}

        {/* 14. Mudança de Categoria por Idade (chegada vs. hoje) */}
        {age_category_changes.length > 0 && (
          <ChartCard title="Mudança de Categoria por Idade (Chegada → Hoje)" icon="🐄" span2>
            {/* Summary chips */}
            {ageCatSummary && ageCatSummary.total_entradas_analisadas > 0 && (
              <div className="flex flex-wrap gap-3 mb-4">
                <span className="px-3 py-1 rounded-full bg-slate-700 text-xs text-slate-300">
                  📊 {(ageCatSummary.total_entradas_analisadas ?? 0).toLocaleString('pt-BR')} entradas analisadas
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400">
                  🔄 {(ageCatSummary.total_mudaram_categoria ?? 0).toLocaleString('pt-BR')} mudaram de categoria
                  {ageCatSummary.pct_mudaram != null && ` (${ageCatSummary.pct_mudaram}%)`}
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-700/50 text-xs text-slate-400">
                  ✓ {(ageCatSummary.total_nao_mudaram ?? 0).toLocaleString('pt-BR')} na mesma categoria
                </span>
              </div>
            )}
            <p className="text-slate-500 text-xs mb-3 -mt-1">
              Para cada registro de entrada: calcula a idade na chegada
              (<span className="text-slate-300">idade atual − meses desde a entrada</span>) e compara com a
              categoria atual pela idade.
            </p>
            <ResponsiveContainer width="100%" height={Math.max(180, Math.min(age_category_changes.length, 15) * 36)}>
              <BarChart data={age_category_changes.slice(0, 15)} layout="vertical" barSize={18}>
                <CartesianGrid {...GRID} />
                <XAxis type="number" tick={TICK} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={160}
                  tick={{ ...TICK, fontSize: 10 }}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v) => [fmtNum(v), 'Animais']}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="quantidade" name="Animais" radius={[0, 4, 4, 0]}>
                  {age_category_changes.slice(0, 15).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {age_category_changes.length > 15 && (
              <p className="text-slate-600 text-xs mt-2">
                Exibindo 15 transições mais frequentes de {age_category_changes.length} no total.
              </p>
            )}
          </ChartCard>
        )}

        {/* 15. Cronograma de Mudanças de Categoria por Período */}
        {age_changes_timeline.length > 0 && (() => {
          // Unique transition types sorted by total volume descending
          const transitionTotals = {}
          age_changes_timeline.forEach(r => {
            transitionTotals[r.transicao] = (transitionTotals[r.transicao] || 0) + r.quantidade
          })
          const transitions = Object.keys(transitionTotals)
            .sort((a, b) => transitionTotals[b] - transitionTotals[a])
            .slice(0, 6)

          // Unique periods sorted
          const periods = [...new Set(age_changes_timeline.map(r => r.periodo))].sort()

          // Pivot to wide format
          const wide = periods.map(p => {
            const row = { periodo: p }
            transitions.forEach(t => {
              const match = age_changes_timeline.find(r => r.periodo === p && r.transicao === t)
              row[t] = match ? match.quantidade : 0
            })
            row._total = transitions.reduce((s, t) => s + (row[t] || 0), 0)
            return row
          })

          return (
            <ChartCard
              title="Quando Ocorreram as Mudanças de Categoria"
              icon="📅"
              span2={periods.length > 3}
            >
              <p className="text-slate-500 text-xs mb-3 -mt-2">
                Estimativa do mês em que cada animal cruzou o limiar de idade de categoria,
                calculado a partir da data de entrada e da idade na chegada.
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={wide}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="periodo" tick={TICK} />
                  <YAxis tick={TICK} allowDecimals={false} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload || {}
                      return (
                        <div style={TOOLTIP_STYLE.contentStyle}>
                          <p style={{ color: '#f1f5f9', marginBottom: 6, fontWeight: 600 }}>{label}</p>
                          <p style={{ color: '#94a3b8', marginBottom: 4, fontSize: 11 }}>
                            Total: {fmtNum(row._total)} mudanças
                          </p>
                          {transitions.map((t, i) => row[t] > 0 && (
                            <p key={t} style={{ color: PALETTE[i % PALETTE.length], margin: '2px 0' }}>
                              {t}: {fmtNum(row[t])}
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  {transitions.map((t, i) => (
                    <Bar
                      key={t}
                      dataKey={t}
                      stackId="a"
                      fill={PALETTE[i % PALETTE.length]}
                      name={t}
                      radius={i === transitions.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )
        })()}

      </div>
    </div>
  )
}
