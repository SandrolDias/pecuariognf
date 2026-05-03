import React, { useState, useEffect, useCallback } from 'react'
import { getRecord, updateRecord } from '../services/api'

// ── Categoria_Calculada recalculation (mirrors backend logic) ─────────────────
const MALE_RE   = /^(m|macho|male|masculino)$/i
const FEMALE_RE = /^(f|femea|fêmea|female|feminino)$/i

function recalcCategoria(idade, sexo) {
  const age = parseFloat(idade)
  if (isNaN(age) || age < 0) return 'Categoria não identificada'
  const isMale   = MALE_RE.test(String(sexo || '').trim())
  const isFemale = FEMALE_RE.test(String(sexo || '').trim())
  if (age <= 12)  return 'Bezerro'
  if (age <= 24)  return isMale ? 'Garrote' : isFemale ? 'Novilha' : 'Categoria não identificada'
  if (age <= 36)  return isMale ? 'Boi' : isFemale ? 'Vaca' : 'Categoria não identificada'
  return isMale ? 'Boi 37+' : isFemale ? 'Vaca 37+' : 'Categoria não identificada'
}

// ── Field config ──────────────────────────────────────────────────────────────
// Note: 'id' and 'id_animal' both represent the brinco — we show whichever exists
const FIELD_CONFIG = [
  { key: 'id',            label: 'ID / Brinco',        type: 'text',   readOnly: false, highlight: true },
  { key: 'id_animal',     label: 'ID Usual / Brinco',  type: 'text',   readOnly: false, highlight: true },
  { key: 'data_pesagem',  label: 'Data Pesagem',        type: 'date',   readOnly: false },
  { key: 'data',          label: 'Data Movimentação',   type: 'date',   readOnly: false },
  { key: 'peso',          label: 'Peso (kg)',            type: 'number', readOnly: false },
  { key: 'evento',        label: 'Evento',               type: 'text',   readOnly: false },
  { key: 'idade',         label: 'Idade (meses)',        type: 'number', readOnly: false },
  { key: 'sexo',          label: 'Sexo (M/F)',           type: 'text',   readOnly: false },
  { key: 'categoria_calculada', label: 'Categoria Calculada', type: 'text', readOnly: true,
    note: 'Calculado automaticamente a partir de Idade e Sexo' },
  { key: 'fazenda',       label: 'Fazenda',              type: 'text',   readOnly: false },
  { key: 'lote',          label: 'Lote',                 type: 'text',   readOnly: false },
  { key: 'origem',        label: 'Origem',               type: 'text',   readOnly: false },
  { key: 'destino',       label: 'Destino',              type: 'text',   readOnly: false },
  { key: 'quantidade',    label: 'Quantidade',           type: 'number', readOnly: false },
  { key: 'categoria',     label: 'Categoria Original',  type: 'text',   readOnly: false },
]

// ── Format date for display ───────────────────────────────────────────────────
function parseDateForInput(val) {
  if (!val) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  // DD/MM/YYYY → YYYY-MM-DD
  const m = String(val).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}

function formatDateForPayload(val) {
  if (!val) return null
  // YYYY-MM-DD → DD/MM/YYYY
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return val
}

// ── Badge component ───────────────────────────────────────────────────────────
function CritBadge({ label }) {
  const cls = {
    Alta:  'text-red-400 bg-red-400/10 border-red-400/30',
    Média: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    Baixa: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cls[label] || cls.Baixa}`}>
      {label}
    </span>
  )
}

// ── Main modal component ──────────────────────────────────────────────────────
export default function RecordEditorModal({ issue, onClose, onSaved }) {
  const [recordData,   setRecordData]   = useState(null)
  const [formValues,   setFormValues]   = useState({})
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)
  const [saveSuccess,  setSaveSuccess]  = useState(false)
  const [remValidations, setRemValidations] = useState([])

  // ── Load record ──────────────────────────────────────────────────────────
  const loadRecord = useCallback(async () => {
    if (!issue?.registro_id) {
      setError('Registro não identificado. Verifique se o item de validação possui registro_id.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getRecord(issue.registro_id)
      setRecordData(res.data)
      const rec = res.data.record || {}
      // Initialise form with record values
      const init = {}
      for (const fc of FIELD_CONFIG) {
        const v = rec[fc.key]
        if (fc.type === 'date') {
          init[fc.key] = parseDateForInput(v)
        } else {
          init[fc.key] = v ?? ''
        }
      }
      // Also carry over any extra columns not in FIELD_CONFIG
      for (const [k, v] of Object.entries(rec)) {
        if (!(k in init)) init[k] = v ?? ''
      }
      setFormValues(init)
      setRemValidations(res.data.validations || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erro ao carregar o registro.')
    } finally {
      setLoading(false)
    }
  }, [issue?.registro_id])

  useEffect(() => { loadRecord() }, [loadRecord])

  // ── Handle field changes ─────────────────────────────────────────────────
  const handleChange = (key, val) => {
    setFormValues((prev) => {
      const next = { ...prev, [key]: val }
      // Auto-recalculate categoria_calculada on idade or sexo change
      if (key === 'idade' || key === 'sexo') {
        next.categoria_calculada = recalcCategoria(
          key === 'idade' ? val : prev.idade,
          key === 'sexo'  ? val : prev.sexo,
        )
      }
      return next
    })
    setSaveSuccess(false)
  }

  // ── Save handler ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!issue?.registro_id) return
    setSaving(true)
    setError(null)
    try {
      // Build updates dict — only fields that changed vs original record
      const original = recordData?.record || {}
      const updates  = {}
      for (const fc of FIELD_CONFIG) {
        if (fc.readOnly) continue
        let newVal = formValues[fc.key]
        let origVal = original[fc.key] ?? ''
        // Convert dates back to DD/MM/YYYY for the backend
        if (fc.type === 'date') {
          newVal  = formatDateForPayload(newVal)
          origVal = origVal ? String(origVal) : ''
        }
        // Only include changed fields
        if (String(newVal ?? '') !== String(origVal ?? '')) {
          updates[fc.key] = newVal === '' ? null : newVal
        }
      }

      if (Object.keys(updates).length === 0) {
        setSaving(false)
        setSaveSuccess(true)
        return
      }

      const res = await updateRecord(issue.registro_id, updates)
      setSaveSuccess(true)
      setRemValidations(res.data.remaining_validations || [])
      // Update form with fresh record data from server
      const updated = res.data.updated_record || {}
      setFormValues((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(updated)) {
          const fc = FIELD_CONFIG.find((f) => f.key === k)
          next[k] = fc?.type === 'date' ? parseDateForInput(String(v || '')) : (v ?? '')
        }
        return next
      })

      if (onSaved) onSaved(res.data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Erro ao salvar a correção.')
    } finally {
      setSaving(false)
    }
  }

  // ── Escape key to close ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔧</span>
            <div>
              <h2 className="text-white font-bold text-lg">Editar Registro</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Aba: <span className="text-slate-300">{issue?.aba || '—'}</span>
                &nbsp;·&nbsp;
                Linha Excel: <span className="text-slate-300">{issue?.excel_row_number || issue?.linha || '—'}</span>
                {issue?.id_brinco && (
                  <>&nbsp;·&nbsp;ID/Brinco: <span className="text-emerald-400 font-medium">{issue.id_brinco}</span></>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl transition-colors p-1 rounded-lg hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Inconsistency banner */}
        {issue && (
          <div className="mx-6 mt-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-yellow-400 text-lg mt-0.5">⚠️</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-white font-semibold text-sm">{issue.tipo_erro}</span>
                  <CritBadge label={issue.criticidade} />
                  <span className="text-slate-500 text-xs">
                    Campo: <span className="text-slate-300 font-medium">{issue.coluna}</span>
                  </span>
                </div>
                <p className="text-slate-300 text-xs">{issue.descricao}</p>
                {issue.acao_recomendada && (
                  <p className="text-emerald-400 text-xs mt-1">
                    💡 {issue.acao_recomendada}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-slate-400 text-sm">Carregando registro…</p>
            </div>
          ) : error && !recordData ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
              ⚠️ {error}
            </div>
          ) : (
            <>
              {/* Success message */}
              {saveSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm fade-in">
                  ✅ Registro salvo com sucesso.
                  {remValidations.length === 0
                    ? ' Nenhuma inconsistência remanescente neste registro.'
                    : ` ${remValidations.length} inconsistência(s) remanescente(s).`}
                </div>
              )}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Form fields grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FIELD_CONFIG.filter((fc) => fc.key in formValues).map((fc) => {
                  const isErrorField = fc.key === issue?.coluna
                  const isIdField    = fc.key === 'id'
                  return (
                    <div
                      key={fc.key}
                      className={`space-y-1 ${isIdField ? 'md:col-span-2' : ''}`}
                    >
                      <label className={`block text-xs font-semibold uppercase tracking-wide ${
                        isIdField    ? 'text-emerald-400' :
                        isErrorField ? 'text-yellow-400'  :
                        fc.readOnly  ? 'text-slate-500'   :
                        'text-slate-400'
                      }`}>
                        {fc.label}
                        {isIdField    && ' 🐄'}
                        {isErrorField && ' ⚠️'}
                        {fc.readOnly  && ' 🔒'}
                      </label>

                      {fc.readOnly ? (
                        <div className={`w-full rounded-lg px-3 py-2 text-sm ${
                          fc.key === 'categoria_calculada'
                            ? 'bg-slate-900/60 border border-emerald-500/20 text-emerald-300 font-semibold'
                            : 'bg-slate-900/40 border border-slate-700 text-slate-400'
                        }`}>
                          {String(formValues[fc.key] || '—')}
                          {fc.note && (
                            <span className="block text-slate-600 text-xs mt-0.5 font-normal">
                              {fc.note}
                            </span>
                          )}
                        </div>
                      ) : (
                        <input
                          type={fc.type === 'date' ? 'date' : fc.type === 'number' ? 'number' : 'text'}
                          value={formValues[fc.key] ?? ''}
                          onChange={(e) => handleChange(fc.key, e.target.value)}
                          step={fc.type === 'number' ? 'any' : undefined}
                          className={`
                            w-full rounded-lg px-3 py-2 text-sm text-white
                            bg-slate-900 transition-colors
                            focus:outline-none focus:ring-2
                            ${isIdField
                              ? 'border-2 border-emerald-500/50 focus:border-emerald-400 focus:ring-emerald-400/20'
                              : isErrorField
                              ? 'border-2 border-yellow-500/50 focus:border-yellow-400 focus:ring-yellow-400/20'
                              : 'border border-slate-600 focus:border-emerald-400 focus:ring-emerald-400/20'
                            }
                          `}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Remaining validations after save */}
              {saveSuccess && remValidations.length > 0 && (
                <div className="mt-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                  <p className="text-yellow-400 text-xs font-semibold mb-2 uppercase tracking-wide">
                    Inconsistências remanescentes
                  </p>
                  <div className="space-y-2">
                    {remValidations.map((v, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CritBadge label={v.criticidade} />
                        <span className="text-slate-300">{v.tipo_erro}: {v.descricao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="
              flex items-center gap-2 px-6 py-2
              bg-emerald-600 hover:bg-emerald-500
              disabled:bg-slate-700 disabled:cursor-not-allowed
              text-white text-sm font-semibold rounded-lg transition-colors
            "
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Salvando…
              </>
            ) : '💾 Salvar Correção'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
          {recordData && (
            <span className="ml-auto text-xs text-slate-600">
              registro_id: {issue?.registro_id?.slice(0, 8)}…
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
