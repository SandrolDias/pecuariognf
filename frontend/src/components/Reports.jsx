import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { getData } from '../services/api'

const INTERNAL_COLS = new Set([
  'registro_id', 'sexo_norm', 'evento_norm', 'tipo_movimentacao_norm',
  'semana_ano', 'mes_pesagem', 'mes_ano', 'mes', 'ano', 'mes_nome',
  'peso_corrigido_auto',
])

const COL_LABEL = {
  id:                 'ID / Brinco',
  id_animal:          'ID Usual',
  data:               'Data Mov.',
  data_pesagem:       'Data Pesagem',
  fazenda:            'Fazenda',
  lote:               'Lote',
  categoria:          'G. Sangue',
  categoria_calculada:'Categoria Calc.',
  sexo:               'Sexo',
  tipo_movimentacao:  'Tipo Mov.',
  evento:             'Evento',
  quantidade:         'Qtd',
  peso:               'Peso (kg)',
  peso_original:      'Peso Original',
  valor:              'Valor (R$)',
  origem:             'Origem',
  destino:            'Destino',
  idade:              'Idade (meses)',
  documento:          'Documento',
  observacao:         'Observação',
  aba_origem:         'Aba',
  excel_row_number:   'Linha Excel',
}

const PAGE_SIZES = [25, 50, 100, 250]

function fmtCell(col, val) {
  if (val == null || val === '') return <span className="text-slate-600">—</span>
  if (col === 'data' || col === 'data_pesagem') {
    const raw = typeof val === 'string' ? val.split('T')[0] : String(val)
    const parts = raw.split('-')
    const fmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw
    return <span className="text-slate-300">{fmt}</span>
  }
  if (col === 'peso' || col === 'peso_original') {
    if (Number(val) < 0)
      return <span className="text-red-400 font-medium">{Number(val).toLocaleString('pt-BR')}</span>
    return <span className="text-slate-300">{Number(val).toLocaleString('pt-BR')}</span>
  }
  if (col === 'valor')
    return <span className="text-emerald-400">R$ {Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
  if (col === 'categoria_calculada')
    return <span className="text-emerald-400 text-xs font-medium">{String(val)}</span>
  return <span className="text-slate-300">{String(val)}</span>
}

export default function Reports() {
  const [allCols,       setAllCols]       = useState([])   // [{key, label}]
  const [selectedCols,  setSelectedCols]  = useState([])   // [key]
  const [colFilters,    setColFilters]    = useState({})   // {key: string}
  const [globalSearch,  setGlobalSearch]  = useState('')
  const [allData,       setAllData]       = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [page,          setPage]          = useState(1)
  const [pageSize,      setPageSize]      = useState(50)
  const [sortBy,        setSortBy]        = useState(null)
  const [sortDir,       setSortDir]       = useState('asc')
  const [showColPanel,  setShowColPanel]  = useState(true)

  // ── Load all data in chunks of 1000 ─────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // First page — get metadata + first chunk
      const first = await getData({ page: 1, page_size: 1000 })
      const d     = first.data
      const cols  = (d.columns || [])
        .filter(c => !INTERNAL_COLS.has(c.key))
        .map(c => ({ key: c.key, label: COL_LABEL[c.key] || c.label || c.key }))

      setAllCols(cols)
      setSelectedCols(cols.slice(0, 8).map(c => c.key))

      const totalPages = d.total_pages || 1
      let records      = [...(d.records || [])]

      // Fetch remaining pages
      for (let p = 2; p <= totalPages; p++) {
        const res = await getData({ page: p, page_size: 1000 })
        records = records.concat(res.data.records || [])
      }

      setAllData(records)
    } catch {
      setError('Erro ao carregar dados. Verifique se o arquivo foi importado.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Filter + sort pipeline ───────────────────────────────────────────────
  const processed = useMemo(() => {
    let rows = allData

    // Global search
    if (globalSearch.trim()) {
      const q = globalSearch.trim().toLowerCase()
      rows = rows.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q))
      )
    }

    // Per-column filters
    Object.entries(colFilters).forEach(([col, val]) => {
      if (!val) return
      const q = val.toLowerCase()
      rows = rows.filter(r => String(r[col] ?? '').toLowerCase().includes(q))
    })

    // Sort
    if (sortBy) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortBy] ?? ''
        const bv = b[sortBy] ?? ''
        const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return rows
  }, [allData, globalSearch, colFilters, sortBy, sortDir])

  const totalPages  = Math.max(1, Math.ceil(processed.length / pageSize))
  const safePage    = Math.min(page, totalPages)
  const pageRows    = processed.slice((safePage - 1) * pageSize, safePage * pageSize)
  const visibleCols = allCols.filter(c => selectedCols.includes(c.key))

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
    setPage(1)
  }

  const toggleCol = (key) => {
    setSelectedCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setPage(1)
  }

  const setFilter = (col, val) => {
    setColFilters(prev => ({ ...prev, [col]: val }))
    setPage(1)
  }

  const clearAll = () => {
    setColFilters({})
    setGlobalSearch('')
    setSortBy(null)
    setPage(1)
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers = visibleCols.map(c => c.label).join(';')
    const rows = processed.map(r =>
      visibleCols.map(c => {
        const v = r[c.key] ?? ''
        return `"${String(v).replace(/"/g, '""')}"`
      }).join(';')
    )
    const csv = '﻿' + [headers, ...rows].join('\n')  // BOM for Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `relatorio_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeFilters = Object.values(colFilters).filter(Boolean).length + (globalSearch ? 1 : 0)

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 fade-in">
      <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-slate-400">Carregando dados…</p>
    </div>
  )

  if (error) return (
    <div className="text-center py-16 fade-in">
      <div className="text-5xl mb-4">⚠️</div>
      <p className="text-red-400 mb-4">{error}</p>
      <button onClick={load} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm">
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span> Relatório Personalizado
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {allData.length.toLocaleString('pt-BR')} registros carregados ·{' '}
            {processed.length.toLocaleString('pt-BR')} após filtros ·{' '}
            {visibleCols.length} colunas visíveis
          </p>
        </div>
        <div className="flex gap-2">
          {activeFilters > 0 && (
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 transition-colors"
            >
              Limpar filtros ({activeFilters})
            </button>
          )}
          <button
            onClick={exportCSV}
            disabled={processed.length === 0}
            className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            ⬇ Exportar CSV
          </button>
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 transition-colors"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Global search */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="🔍 Buscar em todos os campos…"
          value={globalSearch}
          onChange={e => { setGlobalSearch(e.target.value); setPage(1) }}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
        >
          {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / página</option>)}
        </select>
      </div>

      {/* Column selector */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowColPanel(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
        >
          <span className="font-medium">🗂 Colunas visíveis ({selectedCols.length} de {allCols.length})</span>
          <span className="text-slate-500">{showColPanel ? '▲' : '▼'}</span>
        </button>
        {showColPanel && (
          <div className="px-4 pb-4 border-t border-slate-700">
            <div className="flex gap-2 mt-3 mb-3">
              <button
                onClick={() => setSelectedCols(allCols.map(c => c.key))}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                Todas
              </button>
              <button
                onClick={() => setSelectedCols([])}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                Nenhuma
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {allCols.map(col => (
                <label
                  key={col.key}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-colors select-none ${
                    selectedCols.includes(col.key)
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(col.key)}
                    onChange={() => toggleCol(col.key)}
                    className="w-3 h-3 accent-emerald-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {visibleCols.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          Selecione ao menos uma coluna para exibir os dados.
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* Column headers with sort */}
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  {visibleCols.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-white transition-colors"
                    >
                      {col.label}
                      {sortBy === col.key && (
                        <span className="ml-1 text-emerald-400">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
                {/* Per-column filter row */}
                <tr className="border-b border-slate-700/60 bg-slate-800/80">
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-2 py-1">
                      <input
                        type="text"
                        placeholder="filtrar…"
                        value={colFilters[col.key] || ''}
                        onChange={e => setFilter(col.key, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 min-w-[60px]"
                      />
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCols.length} className="text-center py-10 text-slate-500 text-sm">
                      Nenhum registro encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row, ri) => (
                    <tr
                      key={row.registro_id || ri}
                      className="border-b border-slate-700/40 hover:bg-slate-700/30 transition-colors"
                    >
                      {visibleCols.map(col => (
                        <td key={col.key} className="px-3 py-2 whitespace-nowrap text-xs max-w-[200px] overflow-hidden text-ellipsis">
                          {fmtCell(col.key, row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700 bg-slate-900/30 text-xs text-slate-400 flex-wrap gap-2">
            <span>
              {processed.length.toLocaleString('pt-BR')} registros ·
              Página {safePage} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >«</button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >‹</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const mid  = Math.min(Math.max(safePage, 3), totalPages - 2)
                const pg   = totalPages <= 5 ? i + 1 : mid - 2 + i
                return pg >= 1 && pg <= totalPages ? (
                  <button
                    key={pg}
                    onClick={() => setPage(pg)}
                    className={`px-2 py-1 rounded transition-colors ${
                      pg === safePage
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {pg}
                  </button>
                ) : null
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >»</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
