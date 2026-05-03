import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 120_000,
})

export const checkHealth    = ()     => api.get('/health')
export const findFile       = ()     => api.get('/find-file')
export const analyzeFile    = ()     => api.get('/analyze')
export const getValidations = ()     => api.get('/validations')
export const getFilters     = ()     => api.get('/filters')
export const exportFile     = ()     => api.get('/export', { responseType: 'blob' })

export const uploadFile = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const getDashboard = (params = {}) => {
  const clean = {}
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      if (v.length > 0) clean[k] = v.join(',')
    } else if (v && v !== '' && v !== 'Todos') {
      clean[k] = v
    }
  }
  return api.get('/dashboard', { params: clean })
}

// ── Base de Dados ─────────────────────────────────────────────────────────────
export const getData = (params = {}) => api.get('/data', { params })

// ── Record editing ────────────────────────────────────────────────────────────
export const getRecord    = (registroId)          => api.get(`/records/${registroId}`)
export const updateRecord = (registroId, updates) => api.put(`/records/${registroId}`, { updates })

export default api
