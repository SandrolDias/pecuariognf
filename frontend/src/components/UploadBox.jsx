import React, { useState, useRef } from 'react'
import { uploadFile } from '../services/api'

export default function UploadBox({ onSuccess }) {
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage]     = useState(null)
  const inputRef = useRef()

  const handleFile = async (file) => {
    if (!file) return
    setMessage(null)

    if (!file.name.toLowerCase().includes('mov_gado')) {
      setMessage({
        type: 'error',
        text: `Nome inválido: "${file.name}". O arquivo deve conter "Mov_gado" no nome.`,
      })
      return
    }

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'xlsm'].includes(ext)) {
      setMessage({
        type: 'error',
        text: `Extensão ".${ext}" não suportada. Use .xlsx, .xls ou .xlsm.`,
      })
      return
    }

    try {
      setUploading(true)
      await uploadFile(file)
      setMessage({ type: 'success', text: `✅ "${file.name}" enviado com sucesso!` })
      onSuccess?.()
    } catch (e) {
      setMessage({
        type: 'error',
        text: e.response?.data?.detail || 'Erro ao enviar o arquivo. Verifique se a API está rodando.',
      })
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">📤 Upload do Arquivo</h2>
        <p className="text-slate-400 text-sm">Envie o arquivo Excel de movimentação de gado</p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer
          transition-all duration-200 select-none
          ${dragging
            ? 'border-emerald-400 bg-emerald-400/10 scale-[1.01]'
            : 'border-slate-600 bg-slate-800/60 hover:border-slate-500 hover:bg-slate-800'}
          ${uploading ? 'cursor-not-allowed opacity-70' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full spinner" />
            <p className="text-slate-300 font-medium">Enviando arquivo…</p>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-4">{dragging ? '📂' : '📁'}</div>
            <p className="text-white font-semibold text-lg mb-1">
              Arraste e solte aqui ou clique para selecionar
            </p>
            <p className="text-slate-400 text-sm">Formatos aceitos: .xlsx, .xls, .xlsm</p>
            <p className="text-slate-500 text-xs mt-2">
              O nome do arquivo deve conter <code className="text-emerald-400">Mov_gado</code>
            </p>
          </>
        )}
      </div>

      {/* Mensagem de resultado */}
      {message && (
        <div className={`p-4 rounded-xl border text-sm font-medium fade-in ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-red-500/10 border-red-500/40 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Instrução alternativa */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>📁</span> Outra opção: copiar o arquivo manualmente
        </h3>
        <p className="text-slate-400 text-sm mb-3">
          Você pode colocar o arquivo diretamente nesta pasta sem precisar fazer upload:
        </p>
        <code className="block bg-slate-900 text-emerald-400 px-4 py-3 rounded-lg text-xs break-all">
          C:\Projeto\Fazenda Morro Branco\Code\backend\uploads\Mov_gado.xlsx
        </code>
        <p className="text-slate-500 text-xs mt-3">
          Após copiar, clique em "Verificar" na tela inicial para confirmar.
        </p>
      </div>
    </div>
  )
}
