import React, { useState, useEffect, useCallback, useRef } from 'react'
import { getData, updateRecord } from '../services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

// Columns to hide from the table (internal / too verbose)
const HIDDEN_COLS = new Set([
  'sexo_norm', 'evento_norm', 'tipo_movimentacao_norm',
  'semana_ano', 'mes_pesagem', 'mes_ano', 'mes', 'ano', 'mes_nome',
])

// Preferred display order (others appended alphabetically after)
const COL_ORDER = [
  'id', 'id_animal', 'data', 'data_pesagem', 'fazenda', 'lote',
  'categoria', 'categoria_calculada', 'sexo', 'tipo_movimentacao',
  'evento', 'quantidade', 'peso', 'valor', 'origem', 'destino',
  'idade', 'documento', 'observacao', 'aba_origem', 'excel_row_number',
]

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toLocaleString('pt-BR')
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
  }
  // ISO date string → pt-BR
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try {
      return new Date(val).toLocaleDateString('pt-BR')
    } catch { /* fall through */ }
  }
  return String(val)
}

function sortColumns(cols) {
  const ordered = COL_ORDER.filter(k => cols.some(c => c.key === k))
  const rest = cols
    .filter(c => !COL_ORDER.includes(c.key) && !HIDDEN_COLS.has(c.key))
    .sort((a, b) => a.key.localeCompare(b.key))
  return [
    ...ordered.map(k => cols.find(c => c.key === k)),
    ...rest,
  ].filter(Boolean)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CellInput({ col, value, onChange }) {
  const base = 'w-full bg-slate-700 border border-emerald-500/60 rounded px-2 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400'

  if (col.key === 'sexo') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        className={base}>
        <option value="">—</option>
        <option value="M">M</option>
        <option value="F">F</option>
      </select>
    )
  }
  if (col.key === 'data' || col.key === 'data_pesagem') {
    // Convert dd/mm/yyyy or ISO to yyyy-mm-dd for <input type=date>
    let iso = value ?? ''
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) {
      const [d, m, y] = iso.split('/')
      iso = `${y}-${m}-${d}`
    } else if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
      iso = iso.slice(0, 10)
    }
    return (
      <input type="date" value={iso}
        onChange={e => onChange(e.target.value)}
        className={base} />
    )
  }
  if (['quantidade', 'peso', 'valor', 'idade'].includes(col.key)) {
    return (
      <input type="number" step="any" value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={base} />
    )
  }
  return (
    <input type="text" value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
      className={base} />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BaseData({ onRecordSaved }) {
  const [records, setRecords]         = useState([])
  const [columns, setColumns]         = useState([])      // [{key, label, editable}]
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(100)
  const [search, setSearch]           = useState('')
  const [sortBy, setSortBy]           = useState(null)
  const [sortOrder, setSortOrder]     = useState('asc')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)

  // Editing state: registro_id → {original, draft, saving, saveError, saved}
  const [editing, setEditing]         = useState({})

  const searchRef = useRef(null)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (opts = {}) => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        page:       opts.page      ?? page,
        page_size:  opts.pageSize  ?? pageSize,
        search:     opts.search    !== undefined ? opts.search : search,
        sort_by:    opts.sortBy    !== undefined ? opts.sortBy : sortBy,
        sort_order: opts.sortOrder ?? sortOrder,
      }
      // strip nulls/undefined
      Object.keys(params).forEach(k => {
        if (params[k] === null || params[k] === undefined || params[k] === '')
          delete params[k]
      })
      const res = await getData(params)
      const d   = res.data

      setRecords(d.records ?? [])
      setTotal(d.total ?? 0)

      if (d.columns && d.columns.length > 0) {
        const visible = d.columns.filter(c => !HIDDEN_COLS.has(c.key))
        setColumns(sortColumns(visible))
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao carregar a base de dados.')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, sortBy, sortOrder])

  useEffect(() => { fetchData() }, [])   // initial load

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    fetchData({ page: 1, search: searchRef.current?.value ?? search })
    setSearch(searchRef.current?.value ?? search)
  }

  const handleClearSearch = () => {
    if (searchRef.current) searchRef.current.value = ''
    setSearch('')
    setPage(1)
    fetchData({ page: 1, search: '' })
  }

  const handleSort = (key) => {
    const newOrder = sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc'
    setSortBy(key)
    setSortOrder(newOrder)
    setPage(1)
    fetchData({ page: 1, sortBy: key, sortOrder: newOrder })
  }

  const handlePageChange = (p) => {
    setPage(p)
    fetchData({ page: p })
  }

  const handlePageSizeChange = (ps) => {
    setPageSize(ps)
    setPage(1)
    fetchData({ page: 1, pageSize: ps })
  }

  // Edit
  const startEdit = (rec) => {
    setEditing(prev => ({
      ...prev,
      [rec.registro_id]: {
        original: { ...rec },
        draft:    { ...rec },
        saving:   false,
        saveError: null,
        saved:    false,
      },
    }))
  }

  const cancelEdit = (id) => {
    setEditing(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateDraft = (id, field, value) => {
    setEditing(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        draft: { ...prev[id].draft, [field]: value },
        saved: false,
        saveError: null,
      },
    }))
  }

  const saveEdit = async (id) => {
    const state = editing[id]
    if (!state) return

    // Diff: only send changed fields
    const updates = {}
    for (const [k, v] of Object.entries(state.draft)) {
      if (k === 'registro_id' || k === 'categoria_calculada') continue
      const orig = state.original[k]
      if (String(v ?? '') !== String(orig ?? '')) {
        updates[k] = v
      }
    }

    if (Object.keys(updates).length === 0) {
      cancelEdit(id)
      return
    }

    setEditing(prev => ({ ...prev, [id]: { ...prev[id], saving: true, saveError: null } }))

    try {
      const res = await updateRecord(id, updates)
      const updated = res.data.updated_record ?? {}

      // Merge updated record back into the table
      setRecords(prev =>
        prev.map(r => r.registro_id === id ? { ...r, ...updated } : r)
      )

      setEditing(prev => ({
        ...prev,
        [id]: { ...prev[id], saving: false, saved: true, saveError: null },
      }))

      // Notify parent to refresh dashboard/validations
      if (onRecordSaved) onRecordSaved(res.data)

      // Auto-close edit state after brief success display
      setTimeout(() => cancelEdit(id), 1800)
    } catch (e) {
      const msg = e.response?.data?.detail || 'Erro ao salvar. Tente novamente.'
      setEditing(prev => ({
        ...prev,
        [id]: { ...prev[id], saving: false, saveError: msg },
      }))
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const visibleCols = columns.filter(c => !HIDDEN_COLS.has(c.key))

  return (
    <div className="space-y-4 fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">🗄️ Base de Dados</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            {total.toLocaleString('pt-BR')} registros tratados
            {Object.keys(editing).length > 0 && (
              <span className="ml-2 text-yellow-400">
                · {Object.keys(editing).length} linha(s) em edição
              </span>
            )}
          </p>
        </div>

        <button
          onClick={() => fetchData()}
          disabled={loading}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
          <span>⚠️</span> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Search + page size */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <input
              ref={searchRef}
              type="text"
              defaultValue={search}
              placeholder="Buscar em qualquer campo…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 pl-9 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          </div>
          <button type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
            Buscar
          </button>
          {search && (
            <button type="button" onClick={handleClearSearch}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">
              ✕ Limpar
            </button>
          )}
        </form>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Linhas:</span>
          {PAGE_SIZE_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => handlePageSizeChange(n)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                pageSize === n
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="relative overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
        {loading && (
          <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center z-10 rounded-xl">
            <div className="w-8 h-8 border-3 border-emerald-400 border-t-transparent rounded-full spinner" />
          </div>
        )}

        {visibleCols.length === 0 && !loading ? (
          <div className="py-16 text-center text-slate-500">
            <div className="text-4xl mb-3">📂</div>
            <p>Nenhum dado carregado. Faça o upload do arquivo Mov_gado.</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-slate-400 font-semibold whitespace-nowrap w-20">
                  Ações
                </th>
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-3 py-2.5 text-slate-400 font-semibold whitespace-nowrap cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortBy === col.key ? (
                        <span className="text-emerald-400">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      ) : (
                        <span className="text-slate-700">↕</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {records.map((rec) => {
                const id    = rec.registro_id
                const state = editing[id]
                const isEditing = !!state
                const draft = state?.draft ?? rec

                return (
                  <tr
                    key={id}
                    className={`transition-colors ${
                      state?.saved
                        ? 'bg-emerald-500/10'
                        : isEditing
                        ? 'bg-slate-800/80'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Action cell */}
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {!isEditing ? (
                        <button
                          onClick={() => startEdit(rec)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-md text-xs transition-colors font-medium"
                        >
                          ✏️ Editar
                        </button>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => saveEdit(id)}
                            disabled={state.saving}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
                          >
                            {state.saving ? '⏳' : state.saved ? '✅' : '💾 Salvar'}
                          </button>
                          <button
                            onClick={() => cancelEdit(id)}
                            disabled={state.saving}
                            className="px-2.5 py-1 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-slate-300 hover:text-white rounded-md text-xs transition-colors"
                          >
                            ✕ Cancelar
                          </button>
                          {state.saveError && (
                            <span className="text-red-400 text-xs leading-tight">
                              ⚠️ {state.saveError}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Data cells */}
                    {visibleCols.map(col => {
                      const val = draft[col.key]
                      const canEdit = isEditing && col.editable

                      return (
                        <td key={col.key} className="px-3 py-1.5 align-top">
                          {canEdit ? (
                            <CellInput
                              col={col}
                              value={draft[col.key]}
                              onChange={(v) => updateDraft(id, col.key, v)}
                            />
                          ) : (
                            <span className={`${
                              col.key === 'categoria_calculada'
                                ? 'text-emerald-400 font-medium'
                                : col.key === 'registro_id'
                                ? 'text-slate-600 font-mono text-[10px]'
                                : val === null || val === undefined || val === ''
                                ? 'text-slate-600'
                                : 'text-slate-200'
                            } whitespace-nowrap`}>
                              {fmt(val)}
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {records.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={visibleCols.length + 1}
                    className="py-12 text-center text-slate-500"
                  >
                    {search ? `Nenhum resultado para "${search}"` : 'Sem registros.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-slate-500">
            Página <span className="text-white font-medium">{page}</span> de{' '}
            <span className="text-white font-medium">{totalPages}</span>
            {' '}· {total.toLocaleString('pt-BR')} registros
          </p>

          <div className="flex items-center gap-1">
            <PageBtn label="«" onClick={() => handlePageChange(1)}         disabled={page === 1} />
            <PageBtn label="‹" onClick={() => handlePageChange(page - 1)} disabled={page === 1} />

            {/* Page number buttons — show up to 5 around current */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const offset = Math.max(0, Math.min(page - 3, totalPages - 5))
              const p = i + 1 + offset
              return (
                <PageBtn
                  key={p}
                  label={p}
                  onClick={() => handlePageChange(p)}
                  active={p === page}
                />
              )
            })}

            <PageBtn label="›" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} />
            <PageBtn label="»" onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} />
          </div>
        </div>
      )}
    </div>
  )
}

function PageBtn({ label, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-md text-sm font-medium transition-colors
        ${active
          ? 'bg-emerald-600 text-white'
          : disabled
          ? 'bg-slate-800 text-slate-700 cursor-not-allowed'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
        }`}
    >
      {label}
    </button>
  )
}
