# Dashboard Pecuário — Fazenda Morro Branco

Sistema web completo para análise de movimentação de gado, geração de KPIs
pecuários, validação de inconsistências e exportação de relatórios executivos.

---

## Objetivo

Ler o arquivo Excel `Mov_gado`, processar os dados de movimentação de gado,
identificar inconsistências automaticamente, calcular indicadores gerenciais e
exibir dashboards interativos com gráficos, tabelas e resumo executivo.

---

## Tecnologias

| Camada    | Tecnologia                                  |
|-----------|---------------------------------------------|
| Backend   | Python 3.11+, FastAPI, Pandas, OpenPyXL     |
| Frontend  | React 18, Vite, Tailwind CSS, Recharts      |
| Servidor  | Uvicorn (ASGI)                              |

---

## Estrutura de Pastas

```
C:\Projeto\Fazenda Morro Branco\Code\
│
├── backend\
│   ├── main.py                  ← API FastAPI (todos os endpoints)
│   ├── requirements.txt         ← Dependências Python
│   ├── services\
│   │   ├── excel_reader.py      ← Leitura e mapeamento do Excel
│   │   ├── data_cleaner.py      ← Limpeza e normalização dos dados
│   │   ├── validator.py         ← 16 regras de validação
│   │   ├── kpi_engine.py        ← Cálculo de KPIs pecuários
│   │   └── exporter.py          ← Exportação para Excel
│   ├── uploads\                 ← ★ Coloque o Mov_gado.xlsx aqui
│   └── outputs\                 ← Relatórios gerados automaticamente
│
├── frontend\
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── index.html
│   └── src\
│       ├── App.jsx              ← Componente principal + navegação
│       ├── index.css
│       ├── main.jsx
│       ├── services\
│       │   └── api.js           ← Chamadas HTTP ao backend
│       └── components\
│           ├── UploadBox.jsx    ← Upload com drag-and-drop
│           ├── KPICards.jsx     ← Cards de indicadores
│           ├── Dashboard.jsx    ← Tela principal do dashboard
│           ├── Charts.jsx       ← 8 tipos de gráficos (Recharts)
│           ├── Filters.jsx      ← Painel de filtros
│           ├── ValidationTable.jsx ← Tabela de inconsistências
│           └── ExecutiveSummary.jsx ← Resumo executivo comentado
│
├── README.md
└── .gitignore
```

---

## Onde colocar o arquivo Mov_gado

Copie o arquivo para:

```
C:\Projeto\Fazenda Morro Branco\Code\backend\uploads\Mov_gado.xlsx
```

Extensões aceitas: `.xlsx`, `.xls`, `.xlsm`

O nome do arquivo **deve conter** `Mov_gado` (maiúsculas/minúsculas não importam).

Você também pode fazer o upload diretamente pela interface web (aba **Upload**).

---

## Instalação e execução

### Pré-requisitos

- Python 3.11 ou superior
- Node.js 18 ou superior
- npm 9 ou superior

---

### Backend (API FastAPI)

```bash
cd "C:\Projeto\Fazenda Morro Branco\Code\backend"

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

A API estará disponível em: http://localhost:8000

Documentação interativa (Swagger): http://localhost:8000/docs

---

### Frontend (React + Vite)

```bash
cd "C:\Projeto\Fazenda Morro Branco\Code\frontend"

npm install

npm run dev
```

A interface estará disponível em: http://localhost:3000

---

## Como usar o app

1. **Inicie o backend** (porta 8000) e o **frontend** (porta 3000).
2. Acesse `http://localhost:3000` no navegador.
3. Na aba **Início**, verifique se o arquivo foi detectado automaticamente.
4. Caso não detectado, vá para **Upload** e envie o arquivo `Mov_gado.xlsx`.
5. Na aba **Análise**, veja as abas, colunas e estrutura do arquivo.
6. Na aba **Dashboard**, explore os KPIs, gráficos e resumo executivo.
7. Na aba **Validações**, revise as inconsistências classificadas por criticidade.
8. Na aba **Exportar**, baixe o relatório Excel completo.

---

## Endpoints da API

| Método | Rota          | Descrição                                  |
|--------|---------------|--------------------------------------------|
| GET    | /health       | Status da API                              |
| GET    | /find-file    | Verifica se o arquivo Mov_gado existe      |
| POST   | /upload       | Faz upload do arquivo Excel                |
| GET    | /analyze      | Retorna estrutura do arquivo               |
| GET    | /dashboard    | Retorna KPIs e dados dos gráficos          |
| GET    | /validations  | Retorna lista de inconsistências           |
| GET    | /export       | Gera e retorna o relatório Excel           |

---

## KPIs calculados

- Total de animais, entradas, saídas e saldo do rebanho
- Peso total, peso médio e peso médio por lote
- Valor total movimentado e valor médio por cabeça
- Evolução mensal, comparativo por fazenda, lote e categoria
- Taxa de mortalidade (quando disponível)
- Percentual de registros válidos vs. inconsistentes

---

## Exportação

O relatório exportado contém:

| Aba               | Conteúdo                          |
|-------------------|-----------------------------------|
| ORIG_*            | Abas originais do Mov_gado        |
| BASE_TRATADA      | Dados limpos e padronizados       |
| VALIDACOES        | Tabela completa de inconsistências|
| KPIS              | Todos os indicadores calculados   |
| DADOS_DASHBOARD   | Dados dos gráficos em tabela      |
| RESUMO_EXECUTIVO  | Comentários gerenciais automáticos|

Arquivo salvo em:
```
C:\Projeto\Fazenda Morro Branco\Code\backend\outputs\Dashboard_Mov_gado_Fazenda_Morro_Branco.xlsx
```
