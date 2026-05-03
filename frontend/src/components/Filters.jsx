import React, { useState, useEffect, useRef } from 'react'

const Select = ({ label, value, options = [], onChange, disabled }) => (
  <div>
    <label className="block text-slate-400 text-xs mb-1 font-medium">{label}</label>
    <select
      value={value || 'Todos'}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || options.length <= 1}
      className="
        w-full bg-slate-900 border border-slate-600 rounded-lg
        px-3 py-2 text-sm text-white
        focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30
        transition-colors appearance-none cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
      "
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
)

function MultiSelectDropdown({ label, selected = [], options = [], onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const rawOptions = options.filter(o => o !== 'Todos')
  const allSelected = selected.length === 0

  const toggle = (opt) => {
    if (selected.includes(opt)) {
      const next = selected.filter(o => o !== opt)
      onChange(next)
    } else {
      onChange([...selected, opt])
    }
  }

  const selectAll  = () => onChange([])
  const selectNone = () => onChange(rawOptions.slice())   // all checked = same as none filtered; let user uncheck manually
  // Actually: "Nenhuma" means clear selection (= no filter = all), "Todas" means select all checkboxes explicitly
  // Semantics: selected=[] → "Todas" (no filter), selected=[...all] same effect but shows all checked
  // Let's keep: [] = no restriction shown as "Todas", any subset = filter to those

  const summary = allSelected
    ? 'Todas'
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selecionadas`

  const isActive = !allSelected

  return (
    <div ref={ref} className="relative">
      <label className="block text-slate-400 text-xs mb-1 font-medium">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={rawOptions.length === 0}
        className={`
          w-full bg-slate-900 border rounded-lg
          px-3 py-2 text-sm text-left flex items-center justify-between gap-1
          focus:outline-none transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
          ${isActive
            ? 'border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/20'
            : 'border-slate-600 text-white hover:border-slate-500'}
        `}
      >
        <span className="truncate">{summary}</span>
        <span className="text-slate-500 text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="
          absolute z-50 top-full mt-1 left-0 min-w-full w-max max-w-[220px]
          bg-slate-900 border border-slate-600 rounded-xl shadow-2xl
          overflow-hidden
        ">
          {/* Quick actions */}
          <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-slate-700">
            <button
              type="button"
              onClick={selectAll}
              className="flex-1 text-xs py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => onChange(rawOptions.length === selected.length ? [] : [...rawOptions])}
              className="flex-1 text-xs py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              {selected.length === rawOptions.length ? 'Nenhuma' : 'Marcar todas'}
            </button>
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto py-1">
            {rawOptions.map(opt => {
              const checked = allSelected ? false : selected.includes(opt)
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt)}
                    className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer flex-shrink-0"
                  />
                  <span className={`text-sm truncate ${checked ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {opt}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const DateInput = ({ label, value, onChange, min, max }) => (
  <div>
    <label className="block text-slate-400 text-xs mb-1 font-medium">{label}</label>
    <input
      type="date"
      value={value || ''}
      min={min || ''}
      max={max || ''}
      onChange={(e) => onChange(e.target.value)}
      className="
        w-full bg-slate-900 border border-slate-600 rounded-lg
        px-3 py-2 text-sm text-white
        focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30
        transition-colors
      "
    />
  </div>
)

export default function Filters({
  filters = {},
  filterOptions = {},
  onChange,
  onApply,
  onClear,
  loading = false,
}) {
  const [local, setLocal] = useState(filters)

  useEffect(() => { setLocal(filters) }, [filters])

  const set = (key, val) => setLocal((prev) => ({ ...prev, [key]: val }))

  const handleApply = () => {
    onChange?.(local)
    onApply?.(local)
  }

  const handleClear = () => {
    const empty = {
      start_date: '', end_date: '',
      fazenda: 'Todos', lote: 'Todos',
      categoria_calculada: [],
      origem: 'Todos', destino: 'Todos', evento: 'Todos',
    }
    setLocal(empty)
    onChange?.(empty)
    onClear?.()
  }

  const hasActive = Object.entries(local).some(([k, v]) => {
    if (Array.isArray(v)) return v.length > 0
    return v && v !== '' && v !== 'Todos'
  })

  const dateRange = filterOptions.date_range || {}

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span>🔍</span> Filtros
          {hasActive && (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              Ativos
            </span>
          )}
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
        <DateInput
          label="Data Inicial"
          value={local.start_date}
          onChange={(v) => set('start_date', v)}
          min={dateRange.min}
          max={local.end_date || dateRange.max}
        />
        <DateInput
          label="Data Final"
          value={local.end_date}
          onChange={(v) => set('end_date', v)}
          min={local.start_date || dateRange.min}
          max={dateRange.max}
        />
        <Select
          label="Fazenda"
          value={local.fazenda}
          options={filterOptions.fazenda || ['Todos']}
          onChange={(v) => set('fazenda', v)}
        />
        <Select
          label="Lote"
          value={local.lote}
          options={filterOptions.lote || ['Todos']}
          onChange={(v) => set('lote', v)}
        />
        <MultiSelectDropdown
          label="Categoria"
          selected={Array.isArray(local.categoria_calculada) ? local.categoria_calculada : []}
          options={filterOptions.categoria_calculada || []}
          onChange={(v) => set('categoria_calculada', v)}
        />
        <Select
          label="Origem"
          value={local.origem}
          options={filterOptions.origem || ['Todos']}
          onChange={(v) => set('origem', v)}
        />
        <Select
          label="Destino"
          value={local.destino}
          options={filterOptions.destino || ['Todos']}
          onChange={(v) => set('destino', v)}
        />
        <Select
          label="Evento"
          value={local.evento}
          options={filterOptions.evento || ['Todos']}
          onChange={(v) => set('evento', v)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleApply}
          disabled={loading}
          className="
            px-5 py-2 bg-emerald-600 hover:bg-emerald-500
            text-white text-sm font-semibold rounded-lg
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center gap-2
          "
        >
          {loading ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" /> Aplicando…</>
          ) : '✓ Aplicar Filtros'}
        </button>
        {hasActive && (
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
          >
            ✕ Limpar
          </button>
        )}
        {hasActive && dateRange.min && (
          <span className="text-xs text-slate-500 ml-auto">
            📅 Período disponível: {dateRange.min} — {dateRange.max}
          </span>
        )}
      </div>
    </div>
  )
}
