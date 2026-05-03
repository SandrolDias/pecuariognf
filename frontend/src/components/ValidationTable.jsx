import React, { useState, useMemo } from 'react'

const CRIT = {
  Alta:  'text-red-400    bg-red-400/10    border-red-400/30',
  Média: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  Baixa: 'text-blue-400   bg-blue-400/10   border-blue-400/30',
}

const STATUS_CLS = {
  Corrigido:        'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  Pendente:         'text-slate-400   bg-slate-700      border-slate-600',
  'Requer revisão': 'text-yellow-400  bg-yellow-400/10  border-yellow-400/30',
}

const CRIT_ORDER = { Alta: 0, Média: 1, Baixa: 2 }

function Badge({ label, cls }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls || CRIT[label] || CRIT.Baixa}`}>
      {label}
    </span>
  )
}

export default function ValidationTable({ data, loading, onRefresh, onIssueClick }) {
  const [critFilter,   setCritFilter]   = useState('Todos')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [searchTerm,   setSearch]       = useState('')
  const [idSearch,     setIdSearch]     = useState('')
  const [page,         setPage]         = useState(1)
  const PER_PAGE = 25

  const filtered = useMemo(() => {
    if (!data?.issues) return []
    let list = [...data.issues].sort(
      (a, b) => (CRIT_ORDER[a.criticidade] ?? 9) - (CRIT_ORDER[b.criticidade] ?? 9)
    )
    if (critFilter !== 'Todos')   list = list.filter((i) => i.criticidade === critFilter)
    if (statusFilter !== 'Todos') list = list.filter((i) => (i.status || 'Pendente') === statusFilter)
    if (idSearch) {
      const t = idSearch.toLowerCase()
      list = list.filter((i) => String(i.id_brinco || '').toLowerCase().includes(t))
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase()
      list = list.filter(
        (i) =>
          String(i.tipo_erro  || '').toLowerCase().includes(t) ||
          String(i.descricao  || '').toLowerCase().includes(t) ||
          String(i.aba        || '').toLowerCase().includes(t) ||
          String(i.coluna     || '').toLowerCase().includes(t)
      )
    }
    return list
  }, [data, critFilter, statusFilter, searchTerm, idSearch])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const isClickable = (issue) => !!issue?.registro_id

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 fade-in">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400">Verificando inconsistências…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16 fade-in">
        <div className="text-5xl mb-4">✅</div>
        <p className="text-slate-400 mb-4">Nenhum dado de validação disponível.</p>
        <button
          onClick={onRefresh}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          Verificar agora
        </button>
      </div>
    )
  }

  const { total, by_criticidade = {}, by_type = {} } = data

  // Count corrigidos
  const countCorrigidos = data.issues?.filter((i) => i.status === 'Corrigido').length || 0

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>✅</span> Validações
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Inconsistências identificadas automaticamente nos dados
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Instruction banner */}
      <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-sm">
        <span className="text-emerald-400 text-lg">✏️</span>
        <span className="text-slate-300">
          <strong className="text-emerald-400">Clique em uma inconsistência</strong> para abrir o registro e corrigir diretamente.
          Os campos <span className="text-emerald-400 font-medium">ID / Brinco</span> identificam o animal individualmente.
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-slate-400 text-sm mt-1">Total</div>
        </div>
        {['Alta', 'Média', 'Baixa'].map((crit) => (
          <div key={crit} className={`border rounded-xl p-4 ${CRIT[crit]}`}>
            <div className="text-2xl font-bold">{by_criticidade[crit] ?? 0}</div>
            <div className="text-sm mt-1 opacity-80">{crit}</div>
          </div>
        ))}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-400">{countCorrigidos}</div>
          <div className="text-emerald-300 text-sm mt-1">Corrigidos</div>
        </div>
      </div>

      {/* Tipos mais frequentes */}
      {Object.keys(by_type).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h4 className="text-slate-300 text-sm font-semibold mb-3">Tipos mais frequentes</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(by_type)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([tipo, count]) => (
                <span key={tipo} className="text-xs bg-slate-700 text-slate-300 px-3 py-1 rounded-full">
                  {tipo} <strong className="text-white">({count})</strong>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Criticidade */}
        <div className="flex gap-2 flex-wrap">
          {['Todos', 'Alta', 'Média', 'Baixa'].map((f) => (
            <button
              key={f}
              onClick={() => { setCritFilter(f); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                critFilter === f
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {f}{f !== 'Todos' && ` (${by_criticidade[f] ?? 0})`}
            </button>
          ))}
        </div>
        {/* Status */}
        <div className="flex gap-2 flex-wrap">
          {['Todos', 'Pendente', 'Corrigido'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* ID/Brinco search */}
        <input
          type="text"
          placeholder="🐄 Buscar por ID / Brinco…"
          value={idSearch}
          onChange={(e) => { setIdSearch(e.target.value); setPage(1) }}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 w-48"
        />
        {/* General search */}
        <input
          type="text"
          placeholder="Buscar por tipo, descrição, coluna…"
          value={searchTerm}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-[180px] bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
        />
      </div>

      {/* Table */}
      {total === 0 ? (
        <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-emerald-400 font-semibold text-lg">Nenhuma inconsistência encontrada!</p>
          <p className="text-slate-400 text-sm mt-1">Todos os dados passaram nas validações.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          Nenhum resultado para os filtros aplicados.
        </div>
      ) : (
        <>
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-700">
                    {[
                      'Nº', 'ID / Brinco', 'Aba', 'Linha', 'Coluna',
                      'Tipo de Erro', 'Criticidade', 'Status', 'Descrição', 'Ação Recomendada',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-slate-400 font-semibold whitespace-nowrap text-xs uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((issue, idx) => {
                    const canEdit    = isClickable(issue)
                    const corrected  = issue.status === 'Corrigido'
                    return (
                      <tr
                        key={idx}
                        onClick={() => canEdit && onIssueClick?.(issue)}
                        className={`
                          border-b border-slate-700/50 transition-colors
                          ${canEdit
                            ? 'cursor-pointer hover:bg-slate-700/50 active:bg-slate-700'
                            : 'hover:bg-slate-700/20'}
                          ${corrected ? 'opacity-60' : ''}
                        `}
                      >
                        <td className="px-4 py-3 text-slate-500 text-xs">{issue.nr}</td>
                        <td className="px-4 py-3">
                          {issue.id_brinco ? (
                            <span className="text-emerald-400 font-mono font-semibold text-xs bg-emerald-400/10 px-2 py-0.5 rounded">
                              🐄 {issue.id_brinco}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-medium whitespace-nowrap">{issue.aba}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{issue.linha}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{issue.coluna}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap text-xs">{issue.tipo_erro}</td>
                        <td className="px-4 py-3"><Badge label={issue.criticidade} /></td>
                        <td className="px-4 py-3">
                          <Badge
                            label={issue.status || 'Pendente'}
                            cls={STATUS_CLS[issue.status || 'Pendente']}
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs text-xs">{issue.descricao}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs max-w-xs">{issue.acao_recomendada}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-slate-400">
                Exibindo {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p-1))}
                  disabled={page === 1}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white rounded-lg transition-colors"
                >
                  ← Anterior
                </button>
                <span className="px-3 py-1 text-slate-400">{page}/{totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p+1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white rounded-lg transition-colors"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
