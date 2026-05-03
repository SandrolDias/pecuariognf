import React from 'react'
import TooltipInfo from './TooltipInfo'

const NA = 'Indicador não calculado por ausência de dados suficientes.'
const isNA = (v) => v === NA || v === null || v === undefined

const fmt = (v, pre = '', suf = '') => {
  if (isNA(v)) return 'N/D'
  if (typeof v === 'number') {
    return `${pre}${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suf}`
  }
  return String(v)
}

const CARDS = [
  { key: 'total_entradas',     label: 'Entradas',            icon: '⬆️', suf: ' cab.',  color: 'blue'    },
  { key: 'total_saidas',       label: 'Saídas',              icon: '⬇️', suf: ' cab.',  color: 'orange'  },
  { key: 'saldo_rebanho',      label: 'Saldo do Rebanho',    icon: '⚖️', suf: ' cab.',  color: 'purple'  },
  { key: 'peso_medio',         label: 'Peso Médio',          icon: '🏋️', suf: ' kg',   color: 'teal'    },
  { key: 'peso_total',         label: 'Peso Total',          icon: '📦', suf: ' kg',   color: 'cyan'    },
  { key: 'valor_total',        label: 'Valor Total',         icon: '💰', pre: 'R$ ',    color: 'green'   },
  { key: 'valor_medio_cabeca', label: 'Valor Médio/Cab.',    icon: '💵', pre: 'R$ ',    color: 'lime'    },
  { key: 'total_pesagens',     label: 'Total de Pesagens',   icon: '🔬', suf: ' reg.',  color: 'sky'     },
]

const COLORS = {
  blue:    'bg-blue-500/10    border-blue-500/30    text-blue-400',
  orange:  'bg-orange-500/10  border-orange-500/30  text-orange-400',
  purple:  'bg-purple-500/10  border-purple-500/30  text-purple-400',
  teal:    'bg-teal-500/10    border-teal-500/30    text-teal-400',
  cyan:    'bg-cyan-500/10    border-cyan-500/30    text-cyan-400',
  green:   'bg-green-500/10   border-green-500/30   text-green-400',
  lime:    'bg-lime-500/10    border-lime-500/30    text-lime-400',
  sky:     'bg-sky-500/10     border-sky-500/30     text-sky-400',
  red:     'bg-red-500/10     border-red-500/30     text-red-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  yellow:  'bg-yellow-500/10  border-yellow-500/30  text-yellow-400',
}

function Card({ icon, label, value, colorClass, definition }) {
  return (
    <div className={`rounded-xl border p-4 transition-all hover:scale-[1.02] ${colorClass}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-xl font-bold ${isNA(value) ? 'text-slate-500 text-sm' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-xs mt-1 opacity-70 font-medium flex items-center">
        {label}
        <TooltipInfo definition={definition} />
      </div>
    </div>
  )
}

export default function KPICards({ kpis, totalInconsistencies, metricDefinitions = {} }) {
  if (!kpis) return null

  const saldo    = kpis['saldo_rebanho']
  const saldoNeg = typeof saldo === 'number' && saldo < 0

  return (
    <div className="fade-in">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span>📊</span> Indicadores Principais
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {CARDS.map(({ key, label, icon, pre = '', suf = '', color }) => {
          const raw    = kpis[key]
          const value  = fmt(raw, pre, suf)
          const cname  = (key === 'saldo_rebanho' && saldoNeg) ? COLORS.red : COLORS[color]
          const def    = metricDefinitions[key] || null
          return (
            <Card key={key} icon={icon} label={label} value={value}
                  colorClass={cname} definition={def} />
          )
        })}

        {/* Inconsistências */}
        <Card
          icon="⚠️"
          label="Inconsistências"
          value={totalInconsistencies ?? 0}
          colorClass={totalInconsistencies > 0 ? COLORS.red : COLORS.emerald}
        />

        {/* Taxa de mortalidade */}
        {!isNA(kpis.taxa_mortalidade) && (
          <Card
            icon="💀"
            label="Taxa de Mortalidade"
            value={fmt(kpis.taxa_mortalidade, '', '%')}
            colorClass={parseFloat(kpis.taxa_mortalidade) > 3 ? COLORS.red : COLORS.emerald}
            definition={metricDefinitions['taxa_mortalidade'] || null}
          />
        )}
      </div>
    </div>
  )
}
