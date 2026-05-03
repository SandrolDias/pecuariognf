import React from 'react'
import KPICards from './KPICards'
import Charts from './Charts'
import ExecutiveSummary from './ExecutiveSummary'
import Filters from './Filters'

export default function Dashboard({
  data,
  filters,
  filterOptions,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  filterLoading,
}) {
  if (!data) return null

  const metricDefinitions = data.metric_definitions || {}
  const chartTitles       = data.chart_titles || {}
  const granularity       = data.granularity || 'monthly'

  return (
    <div className="space-y-8 fade-in">
      {/* Period + filter info */}
      {(data.period_start || data.period_end || data.total_filtered != null) && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {data.period_start && (
            <span>📅 Período: <span className="text-slate-300">{data.period_start}</span> → <span className="text-slate-300">{data.period_end || '…'}</span></span>
          )}
          {data.total_filtered != null && (
            <span>📝 Registros: <span className="text-slate-300">{(data.total_filtered ?? 0).toLocaleString('pt-BR')}</span></span>
          )}
          {data.granularity && (
            <span className={`px-2 py-0.5 rounded-full border ${
              granularity === 'weekly'
                ? 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                : 'text-slate-400 bg-slate-700/50 border-slate-600'
            }`}>
              {granularity === 'weekly' ? '📆 Semanal' : '📅 Mensal'}
            </span>
          )}
          {Object.keys(data.filters_applied || {}).length > 0 && (
            <span className="text-emerald-400">
              ✓ {Object.keys(data.filters_applied).length} filtro(s) aplicado(s)
            </span>
          )}
        </div>
      )}

      <Filters
        filters={filters}
        filterOptions={filterOptions}
        onChange={onFiltersChange}
        onApply={onApplyFilters}
        onClear={onClearFilters}
        loading={filterLoading}
      />

      <KPICards
        kpis={data.kpis}
        totalInconsistencies={data.total_inconsistencies}
        metricDefinitions={metricDefinitions}
      />

      <Charts
        chartData={data.chart_data}
        chartTitles={chartTitles}
        granularity={granularity}
        metricDefinitions={metricDefinitions}
        categoryVarSummary={data.category_var_summary || {}}
        ageCatSummary={data.age_cat_summary || {}}
      />

      <ExecutiveSummary comments={data.executive_comments} />
    </div>
  )
}
