import React, { useState, useEffect, useCallback } from 'react'
import {
  findFile, analyzeFile, getDashboard,
  getValidations, exportFile, getFilters,
} from './services/api'
import UploadBox          from './components/UploadBox'
import Dashboard          from './components/Dashboard'
import ValidationTable    from './components/ValidationTable'
import RecordEditorModal  from './components/RecordEditorModal'
import BaseData           from './components/BaseData'
import Reports            from './components/Reports'

// ── Navigation ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'home',        label: 'Início',       icon: '🏠' },
  { id: 'upload',      label: 'Upload',       icon: '📤' },
  { id: 'analysis',    label: 'Análise',      icon: '🔍' },
  { id: 'dashboard',   label: 'Dashboard',    icon: '📊' },
  { id: 'validations', label: 'Validações',   icon: '✅' },
  { id: 'base-dados',  label: 'Base de Dados',icon: '🗄️' },
  { id: 'reports',     label: 'Relatórios',   icon: '📋' },
  { id: 'export',      label: 'Exportar',     icon: '📥' },
]

const EMPTY_FILTERS = {
  start_date: '', end_date: '',
  fazenda: 'Todos', lote: 'Todos',
  categoria_calculada: [],
  origem: 'Todos', destino: 'Todos', evento: 'Todos',
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Spinner({ color = 'emerald', msg }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 fade-in">
      <div className={`w-12 h-12 border-4 border-${color}-400 border-t-transparent rounded-full spinner mb-4`} />
      <p className="text-slate-400">{msg ?? 'Carregando…'}</p>
    </div>
  )
}

function Empty({ msg, onAction, label }) {
  return (
    <div className="text-center py-16 fade-in">
      <div className="text-5xl mb-4">📂</div>
      <p className="text-slate-400 mb-6 max-w-md mx-auto">{msg}</p>
      {onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors font-medium"
        >
          {label ?? 'Tentar novamente'}
        </button>
      )}
    </div>
  )
}

function ErrorBanner({ msg, onClose }) {
  if (!msg) return null
  return (
    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-3 fade-in">
      <span className="text-lg mt-0.5">⚠️</span>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="text-red-400 hover:text-white transition-colors ml-2">✕</button>
    </div>
  )
}

// ── Home tab ──────────────────────────────────────────────────────────────────
function HomeTab({ fileStatus, loadingFile, onCheck, onUpload }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 fade-in">
      <div className="text-center py-10">
        <div className="text-7xl mb-4">🐄</div>
        <h2 className="text-3xl font-bold text-white mb-2">Dashboard Pecuário</h2>
        <p className="text-slate-400 text-lg">Sistema de análise de movimentação de gado</p>
        <p className="text-emerald-500 font-semibold mt-1">Fazenda Morro Branco</p>
      </div>

      <div className={`p-6 rounded-2xl border transition-all ${
        fileStatus?.found
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-slate-800 border-slate-700'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-lg">Status do Arquivo</h3>
          <button
            onClick={onCheck}
            disabled={loadingFile}
            className="text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            🔄 Verificar
          </button>
        </div>

        {loadingFile ? (
          <p className="text-slate-400 text-sm">Verificando…</p>
        ) : fileStatus?.found ? (
          <div className="space-y-2">
            <p className="text-emerald-400 font-semibold">✅ Arquivo encontrado e pronto para análise</p>
            <div className="bg-slate-900/50 rounded-lg p-3 space-y-1 text-sm">
              <p className="text-slate-300">📄 <span className="font-medium">{fileStatus.file_name}</span></p>
              <p className="text-slate-500">📁 {fileStatus.file_path}</p>
              <p className="text-slate-500">
                📅 Modificado: {fileStatus.last_modified
                  ? new Date(fileStatus.last_modified).toLocaleString('pt-BR')
                  : 'N/D'}
              </p>
              <p className="text-slate-500">💾 Tamanho: {fileStatus.file_size_kb} KB</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-red-400 font-medium">❌ Arquivo Mov_gado não encontrado</p>
            <p className="text-slate-400 text-sm">Coloque o arquivo na pasta abaixo ou faça o upload:</p>
            <code className="block bg-slate-900 text-emerald-400 p-3 rounded-lg text-xs break-all">
              C:\Projeto\Fazenda Morro Branco\Code\backend\uploads\Mov_gado.xlsx
            </code>
            <button
              onClick={onUpload}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors font-semibold"
            >
              📤 Fazer Upload do Arquivo
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: '📊', title: 'Dashboard',   desc: 'KPIs e gráficos interativos com filtros dinâmicos' },
          { icon: '✅', title: 'Validações',  desc: 'Detecção automática de inconsistências' },
          { icon: '🔍', title: 'Análise',     desc: 'Estrutura, reconciliação e colunas do arquivo' },
          { icon: '📥', title: 'Exportação',  desc: 'Relatório Excel completo para download' },
        ].map((item) => (
          <div key={item.title} className="p-5 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors">
            <div className="text-3xl mb-2">{item.icon}</div>
            <h4 className="text-white font-semibold mb-1">{item.title}</h4>
            <p className="text-slate-400 text-sm">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Análise tab ───────────────────────────────────────────────────────────────
function AnalysisTab({ data, loading, onRefresh }) {
  if (loading) return <Spinner msg="Analisando arquivo…" />
  if (!data)   return <Empty msg="Faça o upload do arquivo Mov_gado para iniciar a análise." onAction={onRefresh} label="Analisar agora" />

  const divergence = data.divergence ?? 0
  const ps = data.preprocessing_summary ?? {}

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">🔍 Análise do Arquivo</h2>
          <p className="text-slate-400 text-sm mt-1">
            {data.file_path?.split('\\').pop() || data.file_path?.split('/').pop()}
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
        >
          🔄 Atualizar
        </button>
      </div>

      {/* Resumo de pré-processamento */}
      {ps.total_linhas_removidas_preprocessing > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
          <h3 className="text-amber-400 font-semibold mb-3 flex items-center gap-2">
            🧹 Pré-processamento Aplicado
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Linhas 1–10 removidas', value: ps.linhas_1_10_removidas_total ?? 0 },
              {
                label: 'Bloco "Estoque Final" removido',
                value: ps.abas_com_estoque_final > 0
                  ? `${1 + (ps.linhas_removidas_bloco_estoque_final ?? 0)} linhas (${ps.abas_com_estoque_final} aba)`
                  : 'Não encontrado',
              },
              {
                label: 'Total removido (pré-proc.)',
                value: ps.total_linhas_removidas_preprocessing ?? 0,
              },
              {
                label: 'Registros válidos finais',
                value: (ps.total_registros_validos_final ?? 0).toLocaleString('pt-BR'),
              },
            ].map(item => (
              <div key={item.label} className="bg-slate-900/50 rounded-lg p-3">
                <div className="text-white font-bold text-base">{item.value}</div>
                <div className="text-slate-400 text-xs mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumo de reconciliação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '📑', label: 'Abas encontradas',      value: data.total_sheets },
          { icon: '📝', label: 'Registros válidos',     value: (data.total_records ?? 0).toLocaleString('pt-BR') },
          { icon: '🗂️', label: 'Base tratada (linhas)', value: (data.total_base_tratada ?? 0).toLocaleString('pt-BR') },
          {
            icon: divergence !== 0 ? '⚠️' : '✅',
            label: 'Divergência',
            value: divergence === 0 ? 'Sem divergência' : `${divergence} linhas`,
            highlight: divergence !== 0,
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`border rounded-xl p-5 ${
              item.highlight
                ? 'bg-yellow-500/5 border-yellow-500/30'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <div className="text-2xl mb-2">{item.icon}</div>
            <div className={`text-xl font-bold ${item.highlight ? 'text-yellow-400' : 'text-white'}`}>
              {item.value}
            </div>
            <div className="text-slate-400 text-sm mt-1">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="space-y-4">
        {data.sheets?.map((sheet, idx) => (
          <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span>📑</span> {sheet.name}
              </h3>
              <div className="flex items-center gap-3 flex-wrap text-sm text-slate-400">
                <span>Cabeçalho na linha {(sheet.detected_header_row ?? 0) + 1}</span>
                <span>•</span>
                <span>{(sheet.rows_before_dropna ?? sheet.rows)} linhas no Excel</span>
                {sheet.rows_dropped_empty > 0 && (
                  <span className="text-yellow-500">− {sheet.rows_dropped_empty} linhas vazias</span>
                )}
                <span>•</span>
                <span className="text-emerald-400 font-medium">{sheet.rows} válidos</span>
                {sheet.rows_in_base_tratada != null && (
                  <>
                    <span>•</span>
                    <span className="text-blue-400">{sheet.rows_in_base_tratada} na base</span>
                  </>
                )}
                <span>× {sheet.columns} colunas</span>
                {sheet.is_empty && (
                  <span className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 px-2 py-0.5 rounded-full">
                    Vazia
                  </span>
                )}
              </div>
            </div>

            {sheet.error && (
              <p className="text-red-400 text-sm mb-3">⚠️ Erro: {sheet.error}</p>
            )}

            {/* Preprocessing removal log per sheet */}
            {sheet.removal_log && sheet.removal_log.linhas_1_10_removidas > 0 && (
              <div className="mb-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300 flex flex-wrap gap-3">
                <span>🧹 Pré-proc: <strong>{sheet.removal_log.linhas_1_10_removidas}</strong> linhas iniciais removidas</span>
                {sheet.removal_log.estoque_final_encontrado && (
                  <span>
                    · "Estoque Final" na linha <strong>{sheet.removal_log.estoque_final_linha_excel}</strong>
                    {' '}→ removida + <strong>{sheet.removal_log.linhas_removidas_apos_estoque_final}</strong> linhas abaixo
                  </span>
                )}
                <span>· Total removido: <strong>{sheet.removal_log.total_linhas_removidas}</strong></span>
              </div>
            )}

            {sheet.column_mapping && Object.keys(sheet.column_mapping).length > 0 && (
              <div className="mb-3">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">
                  Colunas mapeadas automaticamente
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(sheet.column_mapping).map(([std, orig]) => (
                    <span key={std} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg">
                      <span className="opacity-60">{orig}</span>
                      <span className="mx-1 opacity-40">→</span>
                      <span className="font-semibold">{std}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {sheet.column_names && sheet.column_names.length > 0 && (
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-wide font-semibold mb-2">
                  Todas as colunas ({sheet.column_names.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {sheet.column_names.map((col, i) => {
                    const isMapped = Object.values(sheet.column_mapping || {}).includes(col)
                    return (
                      <span
                        key={i}
                        className={`text-xs px-2 py-1 rounded-lg ${
                          isMapped
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {col}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Export tab ────────────────────────────────────────────────────────────────
function ExportTab({ onExport, loading, success }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">📥 Exportar Relatório</h2>
        <p className="text-slate-400 text-sm">Gera arquivo Excel completo com todos os dados processados</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-6">
        <div className="flex items-start gap-4">
          <span className="text-5xl">📊</span>
          <div>
            <h3 className="text-white font-semibold text-lg">
              Dashboard_Mov_gado_Fazenda_Morro_Branco.xlsx
            </h3>
            <p className="text-slate-400 text-sm mt-1">Relatório executivo completo em formato Excel</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            ['📑', 'Abas originais preservadas'],
            ['🧹', 'Base tratada e padronizada'],
            ['✅', 'Tabela de validações completa'],
            ['📈', 'KPIs calculados'],
            ['📊', 'Dados dos gráficos'],
            ['📋', 'Resumo executivo comentado'],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-2 text-slate-300 text-sm">
              <span>{icon}</span> {label}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-5 space-y-3">
          <p className="text-slate-400 text-sm">
            Salvo automaticamente em:{' '}
            <code className="text-emerald-400 text-xs">
              C:\Projeto\Fazenda Morro Branco\Code\backend\outputs
            </code>
          </p>
          <button
            onClick={onExport}
            disabled={loading}
            className="
              w-full py-3 font-semibold rounded-xl transition-all
              flex items-center justify-center gap-2
              bg-emerald-600 hover:bg-emerald-500
              disabled:bg-slate-700 disabled:cursor-not-allowed
              text-white
            "
          >
            {loading ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full spinner" />
                Gerando relatório…
              </>
            ) : (
              '📥 Baixar Relatório Excel'
            )}
          </button>
        </div>

        {success && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm fade-in">
            ✅ Relatório gerado com sucesso! Verifique sua pasta de downloads e também a pasta{' '}
            <code className="text-emerald-400">backend/outputs/</code>.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab,       setActiveTab]       = useState('home')
  const [fileStatus,      setFileStatus]      = useState(null)
  const [analyzeData,     setAnalyzeData]     = useState(null)
  const [dashboardData,   setDashboardData]   = useState(null)
  const [validationsData, setValidationsData] = useState(null)
  const [filterOptions,   setFilterOptions]   = useState({})
  const [filters,         setFilters]         = useState(EMPTY_FILTERS)
  const [error,           setError]           = useState(null)
  const [exportLoading,   setExportLoading]   = useState(false)
  const [exportSuccess,   setExportSuccess]   = useState(false)
  const [filterLoading,   setFilterLoading]   = useState(false)
  // Record editor modal
  const [editIssue,       setEditIssue]       = useState(null)  // issue being edited

  const [loading, setLoading] = useState({
    file: false, analyze: false, dashboard: false, validations: false,
  })
  const setLoad = (key, val) => setLoading((prev) => ({ ...prev, [key]: val }))

  // ── API calls ────────────────────────────────────────────────────────────
  const checkFile = useCallback(async () => {
    setLoad('file', true)
    try {
      const res = await findFile()
      setFileStatus(res.data)
    } catch {
      setFileStatus({ found: false })
    } finally {
      setLoad('file', false)
    }
  }, [])

  const loadFilters = useCallback(async () => {
    try {
      const res = await getFilters()
      setFilterOptions(res.data)
    } catch {
      // silently ignore filter load failure
    }
  }, [])

  const loadAnalysis = useCallback(async () => {
    setLoad('analyze', true)
    setError(null)
    try {
      const res = await analyzeFile()
      setAnalyzeData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao analisar o arquivo. Verifique se ele foi enviado.')
    } finally {
      setLoad('analyze', false)
    }
  }, [])

  const loadDashboard = useCallback(async (appliedFilters) => {
    setLoad('dashboard', true)
    setError(null)
    try {
      const res = await getDashboard(appliedFilters || filters)
      setDashboardData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao carregar o dashboard.')
    } finally {
      setLoad('dashboard', false)
    }
  }, [filters])

  const loadValidations = useCallback(async () => {
    setLoad('validations', true)
    setError(null)
    try {
      const res = await getValidations()
      setValidationsData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao carregar as validações.')
    } finally {
      setLoad('validations', false)
    }
  }, [])

  const handleApplyFilters = async (filtersFromComponent) => {
    setFilterLoading(true)
    // Use filters passed from component (avoids stale state closure)
    const toApply = filtersFromComponent || filters
    setFilters(toApply)
    await loadDashboard(toApply)
    setFilterLoading(false)
  }

  const handleClearFilters = async () => {
    setFilters(EMPTY_FILTERS)
    setFilterLoading(true)
    try {
      const res = await getDashboard(EMPTY_FILTERS)
      setDashboardData(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao recarregar o dashboard.')
    } finally {
      setFilterLoading(false)
    }
  }

  // Called when user clicks a validation row
  const handleIssueClick = (issue) => {
    if (issue?.registro_id) setEditIssue(issue)
  }

  // Called after successfully saving a record correction
  const handleRecordSaved = async (savedData) => {
    // Refresh validations and dashboard to reflect corrections
    await Promise.all([
      loadValidations(),
      loadDashboard(filters),
    ])
  }

  const handleExport = async () => {
    setExportLoading(true)
    setExportSuccess(false)
    setError(null)
    try {
      const res  = await exportFile()
      const url  = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href  = url
      link.setAttribute('download', 'Dashboard_Mov_gado_Fazenda_Morro_Branco.xlsx')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setExportSuccess(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erro ao exportar o relatório. Verifique se a API está rodando.')
    } finally {
      setExportLoading(false)
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { checkFile() }, [checkFile])
  useEffect(() => { loadFilters() }, [loadFilters])

  useEffect(() => {
    if (activeTab === 'analysis'    && !analyzeData)     loadAnalysis()
    if (activeTab === 'dashboard'   && !dashboardData)   loadDashboard()
    if (activeTab === 'validations' && !validationsData) loadValidations()
  }, [activeTab])

  const handleUploadSuccess = () => {
    checkFile()
    setAnalyzeData(null)
    setDashboardData(null)
    setValidationsData(null)
    setFilterOptions({})
    setFilters(EMPTY_FILTERS)
    setError(null)
    // Reload filters from new file
    setTimeout(loadFilters, 1500)
  }

  const switchTab = (tab) => {
    setActiveTab(tab)
    setError(null)
    setExportSuccess(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl select-none">🐄</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Dashboard Pecuário</h1>
              <p className="text-xs text-emerald-400 font-medium">Fazenda Morro Branco</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {fileStatus?.found ? (
              <span className="hidden sm:flex items-center gap-1.5 text-emerald-400 text-xs bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/30">
                <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                {fileStatus.file_name}
              </span>
            ) : (
              <span className="hidden sm:flex items-center gap-1.5 text-red-400 text-xs bg-red-400/10 px-3 py-1.5 rounded-full border border-red-400/30">
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                Sem arquivo
              </span>
            )}
            <span className="text-slate-600 text-xs hidden md:block">
              {new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-slate-800/70 border-b border-slate-700 backdrop-blur sticky top-[61px] z-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => switchTab(item.id)}
                className={`
                  px-5 py-3.5 text-sm font-medium whitespace-nowrap
                  border-b-2 transition-all duration-150
                  ${activeTab === item.id
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'}
                `}
              >
                <span className="mr-1.5">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <ErrorBanner msg={error} onClose={() => setError(null)} />

        {activeTab === 'home' && (
          <HomeTab
            fileStatus={fileStatus}
            loadingFile={loading.file}
            onCheck={checkFile}
            onUpload={() => switchTab('upload')}
          />
        )}

        {activeTab === 'upload' && (
          <UploadBox onSuccess={handleUploadSuccess} />
        )}

        {activeTab === 'analysis' && (
          <AnalysisTab
            data={analyzeData}
            loading={loading.analyze}
            onRefresh={loadAnalysis}
          />
        )}

        {activeTab === 'dashboard' && (
          loading.dashboard
            ? <Spinner msg="Calculando indicadores e KPIs…" />
            : dashboardData
            ? <Dashboard
                data={dashboardData}
                filters={filters}
                filterOptions={filterOptions}
                onFiltersChange={setFilters}
                onApplyFilters={handleApplyFilters}
                onClearFilters={handleClearFilters}
                filterLoading={filterLoading}
              />
            : <Empty
                msg="Nenhum dado disponível. Faça o upload do arquivo Mov_gado para visualizar o dashboard."
                onAction={() => loadDashboard()}
                label="Carregar dashboard"
              />
        )}

        {activeTab === 'validations' && (
          <ValidationTable
            data={validationsData}
            loading={loading.validations}
            onRefresh={loadValidations}
            onIssueClick={handleIssueClick}
          />
        )}

        {activeTab === 'base-dados' && (
          <BaseData
            onRecordSaved={handleRecordSaved}
          />
        )}

        {activeTab === 'reports' && (
          <Reports />
        )}

        {activeTab === 'export' && (
          <ExportTab
            onExport={handleExport}
            loading={exportLoading}
            success={exportSuccess}
          />
        )}
      </main>

      {/* Record Editor Modal */}
      {editIssue && (
        <RecordEditorModal
          issue={editIssue}
          onClose={() => setEditIssue(null)}
          onSaved={(data) => {
            handleRecordSaved(data)
            setEditIssue(null)
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 text-center text-slate-600 text-xs">
        Dashboard Pecuário — Fazenda Morro Branco © {new Date().getFullYear()}
        &nbsp;|&nbsp; API: <code className="text-slate-500">http://localhost:8000</code>
        &nbsp;|&nbsp; {new Date().toLocaleDateString('pt-BR')}
      </footer>
    </div>
  )
}
