import React from 'react'

const ITEMS = [
  { key: 'principal_movimentacao', label: 'Principal Movimentação',       icon: '📊', variant: 'default' },
  { key: 'saldo_rebanho',          label: 'Saldo do Rebanho',             icon: '⚖️', variant: 'default' },
  { key: 'categoria_relevante',    label: 'Categoria Mais Relevante',     icon: '🐃', variant: 'default' },
  { key: 'fazenda_concentracao',   label: 'Fazenda com Maior Concentração',icon: '🏡', variant: 'default' },
  { key: 'lote_movimentacao',      label: 'Lote com Maior Movimentação',  icon: '🏷️', variant: 'default' },
  { key: 'inconsistencias',        label: 'Inconsistências',              icon: '⚠️', variant: 'warning' },
  { key: 'riscos',                 label: 'Riscos Identificados',         icon: '🔴', variant: 'risk'    },
  { key: 'recomendacoes',          label: 'Recomendações Gerenciais',     icon: '💡', variant: 'tip'     },
]

const VARIANTS = {
  default: 'bg-slate-800 border-slate-700',
  warning: 'bg-yellow-500/5 border-yellow-500/30',
  risk:    'bg-red-500/5   border-red-500/30',
  tip:     'bg-emerald-500/5 border-emerald-500/30',
}

const TEXT_VARIANTS = {
  default: 'text-slate-300',
  warning: 'text-yellow-200',
  risk:    'text-red-200',
  tip:     'text-emerald-200',
}

const LABEL_VARIANTS = {
  default: 'text-white',
  warning: 'text-yellow-300',
  risk:    'text-red-300',
  tip:     'text-emerald-300',
}

export default function ExecutiveSummary({ comments }) {
  if (!comments || Object.keys(comments).length === 0) return null

  const isHighRisk = comments.riscos?.includes('ATENÇÃO')

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>📋</span> Resumo Executivo
        </h2>
        {isHighRisk && (
          <span className="flex items-center gap-1 text-red-400 text-sm bg-red-400/10 px-3 py-1 rounded-full border border-red-400/30 animate-pulse">
            ⚠️ Atenção — Risco crítico identificado
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ITEMS.map(({ key, label, icon, variant }) => {
          const text = comments[key]
          if (!text) return null
          const isRisk = variant === 'risk' && isHighRisk
          return (
            <div
              key={key}
              className={`rounded-xl border p-5 ${isRisk ? VARIANTS.risk : VARIANTS[variant]} transition-all`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{icon}</span>
                <div>
                  <h4 className={`font-semibold text-sm mb-1 ${isRisk ? LABEL_VARIANTS.risk : LABEL_VARIANTS[variant]}`}>
                    {label}
                  </h4>
                  <p className={`text-sm leading-relaxed ${isRisk ? TEXT_VARIANTS.risk : TEXT_VARIANTS[variant]}`}>
                    {text}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rodapé */}
      <div className="mt-4 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-center text-slate-500 text-xs">
        Análise gerada automaticamente com base nos dados do arquivo Mov_gado.
        Valide as informações junto à equipe de campo antes de tomar decisões.
      </div>
    </div>
  )
}
