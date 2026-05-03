import React, { useState, useRef, useEffect } from 'react'

export default function TooltipInfo({ definition }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!definition) return null

  const {
    title, source, formula, meaning, caution,
    columns = [], respects_filters,
  } = definition

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="
          ml-1.5 w-4 h-4 rounded-full bg-slate-600 hover:bg-slate-500
          text-slate-300 text-[10px] font-bold flex items-center justify-center
          transition-colors leading-none
        "
        title="Informações sobre este indicador"
      >
        ?
      </button>

      {open && (
        <div
          className="
            absolute z-50 bottom-6 left-1/2 -translate-x-1/2
            w-72 bg-slate-900 border border-slate-600 rounded-xl
            p-4 shadow-2xl text-left
          "
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-white text-sm">{title}</span>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
          </div>

          {meaning && (
            <p className="text-slate-300 text-xs mb-3 leading-relaxed">{meaning}</p>
          )}

          <div className="space-y-2 text-xs">
            {source && (
              <div>
                <span className="text-slate-500 uppercase tracking-wide font-semibold">Fonte: </span>
                <span className="text-emerald-400">{source}</span>
              </div>
            )}
            {formula && (
              <div>
                <span className="text-slate-500 uppercase tracking-wide font-semibold">Fórmula: </span>
                <span className="text-blue-300 font-mono">{formula}</span>
              </div>
            )}
            {columns.length > 0 && (
              <div>
                <span className="text-slate-500 uppercase tracking-wide font-semibold">Colunas: </span>
                <span className="text-slate-300">{columns.join(', ')}</span>
              </div>
            )}
            {caution && (
              <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <span className="text-yellow-400 text-xs">⚠️ {caution}</span>
              </div>
            )}
            {respects_filters !== undefined && (
              <div className="mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  respects_filters
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {respects_filters ? '✓ Respeita filtros aplicados' : '○ Valor global (ignora filtros)'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
