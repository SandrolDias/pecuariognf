from fastapi.staticfiles import StaticFiles
import os

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import shutil, math, numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

from services.excel_reader import find_mov_gado_file, read_excel_file
from services.data_cleaner import prepare_base_tratada
from services.validator import validate_data
from services.kpi_engine import (
    calculate_kpis, generate_executive_comments,
    get_metric_definitions, calculate_category_variation,
)
from services.exporter import export_excel
from services.record_store import get_store

# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Dashboard Pecuário — Fazenda Morro Branco",
    version="3.0.0",
    description="API para análise de movimentação de gado.",
)
@app.get("/versao")
async def versao():
    return {"versao": "teste-1"}

@app.get("/versao")
async def versao():
    return {"versao": "v4-teste-deploy"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# — linha 33 fecha o middleware

# Servir arquivos estáticos do frontend
frontend_dist = "/home/site/wwwroot/frontend/dist"
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

@app.get("/check-frontend")
async def check_frontend():
    path = "/home/site/wwwroot/frontend/dist"
    return {
        "exists": os.path.exists(path),
        "files": os.listdir(path) if os.path.exists(path) else [],
        "wwwroot": os.listdir("/home/site/wwwroot")
    }

@app.get("/")
async def serve_frontend():
    index = "/home/site/wwwroot/frontend/dist/index.html"
    if os.path.exists(index):
        return FileResponse(index)
    return {"detail": "Frontend não encontrado"}

# — linha 35 começa UPLOAD_DIR

UPLOAD_DIR = Path(__file__).parent / "uploads"
OUTPUT_DIR = Path(__file__).parent / "outputs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

_cache: Dict[str, Any] = {}


# ── JSON helpers ──────────────────────────────────────────────────────────────
def _sanitize(obj):
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        f = float(obj)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    return obj


# ── Core data loader ─────────────────────────────────────────────────────────
def _get_processed_data() -> Dict[str, Any]:
    file_path = find_mov_gado_file()
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail=(
                "Arquivo Mov_gado não encontrado na pasta 'uploads'. "
                "Faça o upload do arquivo ou copie-o para: backend/uploads/"
            ),
        )

    p = Path(file_path)
    cache_key = f"{file_path}|{p.stat().st_mtime}"
    if cache_key in _cache:
        cached = _cache[cache_key]
        # Ensure store is initialized even on cache hits (handles server reload)
        store = get_store()
        if not store.is_initialized() and cached.get("base_tratada") is not None:
            store.initialize(cached["base_tratada"])
        return cached

    # ── Read Excel ────────────────────────────────────────────────────────────
    excel_data = read_excel_file(file_path)

    # ── Original sheets (for export) ─────────────────────────────────────────
    original_sheets_raw: Dict[str, Any] = {}
    for sheet_name, df_raw in excel_data["sheets"].items():
        if not excel_data["structure"][sheet_name].get("is_empty", True):
            original_sheets_raw[sheet_name] = df_raw

    # ── Build BASE_TRATADA (with registro_id + excel_row_number) ─────────────
    base_tratada = prepare_base_tratada(excel_data)

    # ── Validate using BASE_TRATADA (ensures same registro_id) ───────────────
    all_issues: List[Dict] = []
    if base_tratada is not None and "aba_origem" in base_tratada.columns:
        for sheet_name in base_tratada["aba_origem"].unique():
            df_sheet = base_tratada[base_tratada["aba_origem"] == sheet_name].copy()
            issues = validate_data(df_sheet, sheet_name)
            all_issues.extend(issues)

    # ── Inject header validation issues from preprocessing ───────────────────
    issue_counter = [len(all_issues)]
    for sheet_name, structure in excel_data["structure"].items():
        header_issues = structure.get("removal_log", {}).get("header_validation_issues", [])
        for hi in header_issues:
            issue_counter[0] += 1
            all_issues.append({
                "nr":                 issue_counter[0],
                "registro_id":        None,
                "id_brinco":          None,
                "base_tratada_index": None,
                "excel_row_number":   11,
                "aba":                sheet_name,
                "linha":              11,
                "coluna":             f"Coluna {hi.get('coluna_pos', '?')}",
                "tipo_erro":          "Cabeçalho Inesperado",
                "criticidade":        "Alta",
                "descricao":          (
                    f"Coluna {hi.get('coluna_pos')}: encontrado '{hi.get('nome_encontrado')}', "
                    f"esperado '{hi.get('nome_esperado')}'."
                ),
                "impacto":            "Mapeamento de colunas pode estar incorreto, afetando KPIs e análises.",
                "acao_recomendada":   (
                    f"Verificar se a coluna {hi.get('coluna_pos')} do arquivo Excel está com o nome "
                    f"'{hi.get('nome_esperado')}' na linha 11 (linha de cabeçalho)."
                ),
                "valor_original":     hi.get("nome_encontrado"),
                "valor_corrigido":    hi.get("nome_esperado"),
                "status":             "Pendente",
            })

    # ── cleaned_sheets: split BASE_TRATADA by sheet (for /analyze) ───────────
    cleaned_sheets: Dict[str, Any] = {}
    if base_tratada is not None and "aba_origem" in base_tratada.columns:
        for sheet_name in base_tratada["aba_origem"].unique():
            cleaned_sheets[sheet_name] = base_tratada[base_tratada["aba_origem"] == sheet_name]

    # ── KPIs (computed on full unfiltered BASE_TRATADA) ───────────────────────
    kpis: Dict[str, Any] = {}
    comments: Dict[str, str] = {}
    if base_tratada is not None and len(base_tratada) > 0:
        kpis     = calculate_kpis(base_tratada)
        comments = generate_executive_comments(kpis, base_tratada)

    result = {
        "file_path":           file_path,
        "excel_data":          excel_data,
        "cleaned_sheets":      cleaned_sheets,
        "original_sheets_raw": original_sheets_raw,
        "base_tratada":        base_tratada,
        "validations":         all_issues,
        "kpis":                kpis,
        "comments":            comments,
    }

    _cache.clear()
    _cache[cache_key] = result

    # ── Initialise record store when new file is loaded ───────────────────────
    store = get_store()
    if not store.is_initialized() and base_tratada is not None:
        store.initialize(base_tratada)

    return result


def _apply_filters(
    df: pd.DataFrame,
    start_date:          Optional[str] = None,
    end_date:            Optional[str] = None,
    fazenda:             Optional[str] = None,
    lote:                Optional[str] = None,
    categoria_calculada: Optional[str] = None,
    origem:              Optional[str] = None,
    destino:             Optional[str] = None,
    evento:              Optional[str] = None,
) -> pd.DataFrame:
    mask = pd.Series([True] * len(df), index=df.index)

    # Period filter uses data_pesagem (fallback: data)
    date_col = "data_pesagem" if "data_pesagem" in df.columns else ("data" if "data" in df.columns else None)
    if date_col and start_date:
        try:
            sd = pd.to_datetime(start_date)
            mask &= pd.to_datetime(df[date_col], errors="coerce") >= sd
        except Exception:
            pass
    if date_col and end_date:
        try:
            ed = pd.to_datetime(end_date)
            mask &= pd.to_datetime(df[date_col], errors="coerce") <= ed
        except Exception:
            pass

    if fazenda and fazenda != "Todos" and "fazenda" in df.columns:
        mask &= df["fazenda"].astype(str).str.strip().str.lower() == fazenda.strip().lower()

    if lote and lote != "Todos" and "lote" in df.columns:
        mask &= df["lote"].astype(str).str.strip().str.lower() == lote.strip().lower()

    if categoria_calculada and categoria_calculada != "Todos" and "categoria_calculada" in df.columns:
        cats = [c.strip() for c in categoria_calculada.split(",") if c.strip()]
        if cats:
            mask &= df["categoria_calculada"].astype(str).str.strip().isin(cats)

    if origem and origem != "Todos" and "origem" in df.columns:
        mask &= df["origem"].astype(str).str.strip().str.lower() == origem.strip().lower()

    if destino and destino != "Todos" and "destino" in df.columns:
        mask &= df["destino"].astype(str).str.strip().str.lower() == destino.strip().lower()

    if evento and evento != "Todos" and "evento" in df.columns:
        mask &= df["evento"].astype(str).str.strip().str.lower() == evento.strip().lower()

    return df[mask].reset_index(drop=True)


def _unique_sorted(series: pd.Series) -> List[str]:
    vals = series.dropna().astype(str).str.strip()
    vals = vals[vals.str.lower().isin(["", "nan", "none"]) == False]
    return ["Todos"] + sorted(vals.unique().tolist())


def _revalidate_record(df: pd.DataFrame, registro_id: str, sheet_name: str) -> List[Dict]:
    """Run validation on a single record and return matching issues."""
    mask = df["registro_id"] == registro_id
    if not mask.any():
        return []
    df_single = df[mask].copy()
    return validate_data(df_single, sheet_name)


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/debug-store", tags=["Debug"])
def debug_store():
    store = get_store()
    df = store.get_df()
    sample_ids = []
    if df is not None and "registro_id" in df.columns:
        sample_ids = df["registro_id"].dropna().tolist()[:3]
    return {
        "initialized": store.is_initialized(),
        "df_len": len(df) if df is not None else 0,
        "has_registro_id": df is not None and "registro_id" in df.columns,
        "sample_registro_ids": sample_ids,
        "cache_keys": list(_cache.keys()),
    }


@app.get("/health", tags=["Sistema"])
def health():
    return {
        "status":    "online",
        "app":       "Dashboard Pecuário — Fazenda Morro Branco",
        "version":   "3.0.0",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/find-file", tags=["Arquivo"])
def find_file():
    file_path = find_mov_gado_file()
    if file_path:
        p = Path(file_path)
        return {
            "found":         True,
            "file_name":     p.name,
            "file_path":     str(p),
            "file_size_kb":  round(p.stat().st_size / 1024, 1),
            "last_modified": datetime.fromtimestamp(p.stat().st_mtime).isoformat(),
        }
    return {
        "found":   False,
        "message": "Arquivo Mov_gado não encontrado. Faça o upload ou copie o arquivo para backend/uploads/.",
    }


@app.post("/upload", tags=["Arquivo"])
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    if "mov_gado" not in filename.lower():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Nome de arquivo inválido: '{filename}'. "
                "O arquivo deve conter 'Mov_gado' no nome (ex: Mov_gado.xlsx)."
            ),
        )
    ext = Path(filename).suffix.lower()
    if ext not in [".xlsx", ".xls", ".xlsm"]:
        raise HTTPException(
            status_code=400,
            detail=f"Extensão não suportada: '{ext}'. Use .xlsx, .xls ou .xlsm.",
        )

    dest = UPLOAD_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    _cache.clear()
    get_store().reset()

    return {
        "success":      True,
        "message":      f"Arquivo '{filename}' enviado com sucesso.",
        "file_path":    str(dest),
        "file_size_kb": round(dest.stat().st_size / 1024, 1),
    }


@app.get("/analyze", tags=["Análise"])
def analyze():
    data       = _get_processed_data()
    excel_data = data["excel_data"]
    base       = data["base_tratada"]

    sheets_info = []
    for sheet_name, structure in excel_data["structure"].items():
        base_rows = 0
        if base is not None and "aba_origem" in base.columns:
            base_rows = int((base["aba_origem"] == sheet_name).sum())

        removal_log = structure.get("removal_log", {})
        sheets_info.append({
            "name":                sheet_name,
            "rows":                structure.get("rows", 0),
            "rows_before_dropna":  structure.get("rows_before_dropna", structure.get("rows", 0)),
            "rows_dropped_empty":  structure.get("rows_dropped_empty", 0),
            "detected_header_row": structure.get("detected_header_row", 0),
            "columns":             structure.get("columns", 0),
            "column_names":        structure.get("column_names", []),
            "column_mapping":      structure.get("column_mapping", {}),
            "is_empty":            structure.get("is_empty", True),
            "error":               structure.get("error"),
            "rows_in_base_tratada": base_rows,
            # Preprocessing removal log (Ajuste 1)
            "removal_log": removal_log,
        })

    total_valid = sum(s["rows"] for s in sheets_info)
    total_base  = int(len(base)) if base is not None else 0
    divergence  = total_valid - total_base

    # Aggregate removal summary across all sheets
    total_removed_1_10    = sum(s["removal_log"].get("linhas_1_10_removidas", 0) for s in sheets_info)
    sheets_with_ef        = [s for s in sheets_info if s["removal_log"].get("estoque_final_encontrado")]
    total_removed_ef_block = sum(
        1 + s["removal_log"].get("linhas_removidas_apos_estoque_final", 0)
        for s in sheets_with_ef
    )

    preprocessing_summary = {
        "linhas_1_10_removidas_total":        total_removed_1_10,
        "abas_com_estoque_final":             len(sheets_with_ef),
        "linhas_removidas_bloco_estoque_final": total_removed_ef_block,
        "total_linhas_removidas_preprocessing": total_removed_1_10 + total_removed_ef_block,
        "total_registros_validos_final":       total_base,
    }

    return JSONResponse(content=_sanitize({
        "file_path":             data["file_path"],
        "total_sheets":          len(sheets_info),
        "total_records":         total_valid,
        "total_base_tratada":    total_base,
        "divergence":            divergence,
        "sheets":                sheets_info,
        "preprocessing_summary": preprocessing_summary,
        "analyzed_at":           datetime.now().isoformat(),
    }))


@app.get("/filters", tags=["Filtros"])
def get_filters():
    """Returns unique filter values from the processed data for dropdown population."""
    data = _get_processed_data()
    store = get_store()
    base = store.get_df() if store.is_initialized() else data["base_tratada"]

    if base is None or len(base) == 0:
        return JSONResponse(content={
            "date_range":          {"min": None, "max": None},
            "fazenda":             ["Todos"],
            "lote":                ["Todos"],
            "categoria_calculada": ["Todos"],
            "origem":              ["Todos"],
            "destino":             ["Todos"],
            "evento":              ["Todos"],
        })

    date_col = "data_pesagem" if "data_pesagem" in base.columns else ("data" if "data" in base.columns else None)
    date_min = date_max = None
    if date_col:
        dates = pd.to_datetime(base[date_col], errors="coerce").dropna()
        dates = dates[dates.dt.year >= 2000]
        if len(dates) > 0:
            date_min = str(dates.min().date())
            date_max = str(dates.max().date())

    def _col_vals(col):
        if col in base.columns:
            return _unique_sorted(base[col])
        return ["Todos"]

    return JSONResponse(content=_sanitize({
        "date_range":          {"min": date_min, "max": date_max},
        "fazenda":             _col_vals("fazenda"),
        "lote":                _col_vals("lote"),
        "categoria_calculada": _col_vals("categoria_calculada"),
        "origem":              _col_vals("origem"),
        "destino":             _col_vals("destino"),
        "evento":              _col_vals("evento"),
    }))


@app.get("/dashboard", tags=["Dashboard"])
def dashboard(
    start_date:          Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    end_date:            Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    fazenda:             Optional[str] = Query(None),
    lote:                Optional[str] = Query(None),
    categoria_calculada: Optional[str] = Query(None),
    origem:              Optional[str] = Query(None),
    destino:             Optional[str] = Query(None),
    evento:              Optional[str] = Query(None),
):
    data  = _get_processed_data()
    store = get_store()

    # Use corrected BASE_TRATADA from store if available
    base = store.get_df() if store.is_initialized() else data["base_tratada"]

    if base is None or len(base) == 0:
        return JSONResponse(content=_sanitize({
            "kpis":                  {},
            "chart_data":            {},
            "executive_comments":    {},
            "total_inconsistencies": len(data["validations"]),
            "granularity":           "monthly",
            "chart_titles":          {},
            "metric_definitions":    get_metric_definitions(),
            "period_start":          None,
            "period_end":            None,
            "filters_applied":       {},
            "generated_at":          datetime.now().isoformat(),
        }))

    filtered_base = _apply_filters(
        base,
        start_date=start_date,
        end_date=end_date,
        fazenda=fazenda,
        lote=lote,
        categoria_calculada=categoria_calculada,
        origem=origem,
        destino=destino,
        evento=evento,
    )

    kpis     = calculate_kpis(filtered_base, start_date=start_date, end_date=end_date)
    comments = generate_executive_comments(kpis, filtered_base)

    # Chart data (list-type KPIs)
    list_keys = [
        "movimentacao_mensal", "ent_sai_mensal", "evolucao_acumulada",
        "valor_mensal",
        "por_categoria", "por_fazenda", "por_lote",
        "peso_medio_por_lote", "valor_por_lote",
        "age_category_changes", "por_categoria_entrada",
        "age_changes_timeline",
        "peso_evolucao_evento",
        "saidas_por_evento", "por_evento",
        "peso_medio_por_categoria", "peso_medio_por_fazenda",
        "peso_evolucao",
        "category_variation",
        "transition_matrix",
    ]
    chart_data = {k: kpis.get(k, []) for k in list_keys if isinstance(kpis.get(k, []), list)}

    scalar_kpis = {k: v for k, v in kpis.items()
                   if not isinstance(v, (list, dict))}

    filters_applied = {
        k: v for k, v in {
            "start_date": start_date, "end_date": end_date,
            "fazenda": fazenda, "lote": lote,
            "categoria_calculada": categoria_calculada,
            "origem": origem, "destino": destino, "evento": evento,
        }.items() if v
    }

    return JSONResponse(content=_sanitize({
        "kpis":                  scalar_kpis,
        "chart_data":            chart_data,
        "executive_comments":    comments,
        "total_inconsistencies": len(data["validations"]),
        "granularity":           kpis.get("granularity", "monthly"),
        "chart_titles":          kpis.get("chart_titles", {}),
        "metric_definitions":    kpis.get("metric_definitions", {}),
        "period_start":          kpis.get("period_start"),
        "period_end":            kpis.get("period_end"),
        "total_filtered":        len(filtered_base),
        "filters_applied":       filters_applied,
        "category_var_summary":  kpis.get("category_var_summary", {}),
        "category_transitions":  kpis.get("category_transitions", []),
        "age_cat_summary":       kpis.get("age_cat_summary", {}),
        "generated_at":          datetime.now().isoformat(),
    }))


@app.get("/validations", tags=["Validações"])
def validations():
    data  = _get_processed_data()
    store = get_store()

    # If store has corrections, re-validate with current BASE_TRATADA
    if store.is_initialized() and store.has_corrections():
        base = store.get_df()
        issues: List[Dict] = []
        if base is not None and "aba_origem" in base.columns:
            for sheet_name in base["aba_origem"].unique():
                df_sheet = base[base["aba_origem"] == sheet_name].copy()
                sheet_issues = validate_data(df_sheet, sheet_name)
                # Mark corrected items
                corrected = {i["registro_id"] for i in sheet_issues
                             if i.get("registro_id") and store.is_corrected(i["registro_id"])}
                for issue in sheet_issues:
                    rid = issue.get("registro_id")
                    if rid and store.is_corrected(rid):
                        issue["status"] = "Corrigido"
                issues.extend(sheet_issues)
    else:
        issues = list(data["validations"])

    by_criticidade: Dict[str, int] = {"Alta": 0, "Média": 0, "Baixa": 0}
    by_type: Dict[str, int] = {}
    for issue in issues:
        crit = issue.get("criticidade", "Baixa")
        by_criticidade[crit] = by_criticidade.get(crit, 0) + 1
        tipo = issue.get("tipo_erro", "Outro")
        by_type[tipo] = by_type.get(tipo, 0) + 1

    return JSONResponse(content=_sanitize({
        "total":          len(issues),
        "by_criticidade": by_criticidade,
        "by_type":        by_type,
        "issues":         issues,
        "generated_at":   datetime.now().isoformat(),
    }))


# ── Base de Dados endpoint ────────────────────────────────────────────────────

# Columns excluded from the editable BASE_TRATADA view (computed/internal)
_READONLY_COLS = {
    "registro_id", "aba_origem", "excel_row_number",
    "categoria_calculada", "sexo_norm", "evento_norm",
    "tipo_movimentacao_norm", "semana_ano", "mes_pesagem",
    "mes_ano", "mes", "ano", "mes_nome", "entrada", "saida",
}

# Human-friendly column labels for the UI
_COL_LABELS: Dict[str, str] = {
    "id":               "ID / Brinco",
    "id_animal":        "ID Usual",
    "data":             "Data",
    "data_pesagem":     "Data Pesagem",
    "fazenda":          "Fazenda",
    "lote":             "Lote",
    "categoria":        "Categoria",
    "categoria_calculada": "Categoria Calculada",
    "sexo":             "Sexo",
    "tipo_movimentacao":"Tipo Movimentação",
    "evento":           "Evento",
    "quantidade":       "Qtd",
    "entrada":          "Entrada",
    "saida":            "Saída",
    "peso":             "Peso (kg)",
    "valor":            "Valor (R$)",
    "origem":           "Origem",
    "destino":          "Destino",
    "idade":            "Idade (meses)",
    "documento":        "Documento",
    "observacao":       "Observação",
    "aba_origem":       "Aba",
    "excel_row_number": "Linha Excel",
    "registro_id":      "Registro ID",
}


@app.get("/data", tags=["Base de Dados"])
def get_data(
    page:       int           = Query(1,    ge=1,          description="Página (inicia em 1)"),
    page_size:  int           = Query(100,  ge=1, le=10000, description="Registros por página"),
    search:     Optional[str] = Query(None,                description="Busca em qualquer coluna"),
    sort_by:    Optional[str] = Query(None,                description="Coluna para ordenação"),
    sort_order: str           = Query("asc",               description="asc ou desc"),
):
    """Return paginated BASE_TRATADA for the Base de Dados tab."""
    data  = _get_processed_data()
    store = get_store()
    df = store.get_df() if store.is_initialized() else data["base_tratada"]

    if df is None or len(df) == 0:
        return JSONResponse(content={
            "records": [], "total": 0, "page": page, "page_size": page_size,
            "total_pages": 0, "columns": [], "editable_columns": [],
        })

    # ── Search (all string/object columns) ───────────────────────────────────
    if search and search.strip():
        search_lower = search.strip().lower()
        mask = pd.Series([False] * len(df), index=df.index)
        for col in df.columns:
            try:
                mask |= df[col].astype(str).str.lower().str.contains(
                    search_lower, na=False, regex=False
                )
            except Exception:
                pass
        df = df[mask].reset_index(drop=True)

    # ── Sort ──────────────────────────────────────────────────────────────────
    if sort_by and sort_by in df.columns:
        ascending = sort_order.lower() != "desc"
        try:
            df = df.sort_values(by=sort_by, ascending=ascending, na_position="last").reset_index(drop=True)
        except Exception:
            pass

    total = len(df)
    start = (page - 1) * page_size
    end   = start + page_size
    page_df = df.iloc[start:end]

    # Build column metadata
    all_cols = list(df.columns)
    editable = [c for c in all_cols if c not in _READONLY_COLS]

    col_meta = [
        {
            "key":      c,
            "label":    _COL_LABELS.get(c, c),
            "editable": c not in _READONLY_COLS,
        }
        for c in all_cols
    ]

    records = [
        _sanitize(dict(row))
        for _, row in page_df.iterrows()
    ]

    return JSONResponse(content=_sanitize({
        "records":          records,
        "total":            total,
        "page":             page,
        "page_size":        page_size,
        "total_pages":      math.ceil(total / page_size) if total > 0 else 0,
        "columns":          col_meta,
        "editable_columns": editable,
    }))


# ── Record endpoints ──────────────────────────────────────────────────────────

@app.get("/records/{registro_id}", tags=["Registros"])
def get_record(registro_id: str):
    """Return a single record from BASE_TRATADA by its registro_id."""
    data  = _get_processed_data()
    store = get_store()

    if not store.is_initialized():
        raise HTTPException(status_code=503, detail="Base de dados não carregada. Faça o upload do arquivo.")

    record = store.get_record(registro_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Registro '{registro_id}' não encontrado.")

    # Fetch current validations for this record
    base = store.get_df()
    sheet_name = str(record.get("aba_origem", ""))
    df_single = base[base["registro_id"] == registro_id]
    rec_issues = validate_data(df_single.copy(), sheet_name) if len(df_single) > 0 else []

    id_brinco = record.get("id") or record.get("id_animal")
    return JSONResponse(content=_sanitize({
        "registro_id":      registro_id,
        "id_brinco":        id_brinco,
        "excel_row_number": record.get("excel_row_number"),
        "aba_origem":       record.get("aba_origem"),
        "record":           record,
        "validations":      rec_issues,
        "is_corrected":     store.is_corrected(registro_id),
    }))


@app.put("/records/{registro_id}", tags=["Registros"])
def update_record(registro_id: str, payload: Dict[str, Any] = Body(...)):
    """
    Apply corrections to a record in BASE_TRATADA.
    Recalculates Categoria_Calculada if idade/sexo changed.
    Logs all changes to LOG_CORRECOES.
    """
    data  = _get_processed_data()
    store = get_store()

    if not store.is_initialized():
        raise HTTPException(status_code=503, detail="Base de dados não carregada.")

    updates = payload.get("updates", {})
    if not updates:
        raise HTTPException(status_code=400, detail="Nenhum campo enviado para atualização.")

    updated = store.update_record(registro_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Registro '{registro_id}' não encontrado.")

    # Revalidate the updated record
    base = store.get_df()
    sheet_name = str(updated.get("aba_origem", ""))
    df_single = base[base["registro_id"] == registro_id]
    remaining_issues = validate_data(df_single.copy(), sheet_name) if len(df_single) > 0 else []

    return JSONResponse(content=_sanitize({
        "success":              True,
        "message":              "Registro atualizado com sucesso.",
        "registro_id":          registro_id,
        "id_brinco":            updated.get("id"),
        "categoria_calculada":  updated.get("categoria_calculada"),
        "remaining_validations": remaining_issues,
        "updated_record":       updated,
    }))


# ── Export ────────────────────────────────────────────────────────────────────

@app.get("/export", tags=["Exportação"])
def export():
    data  = _get_processed_data()
    store = get_store()

    # Use corrected BASE_TRATADA if available
    base = store.get_df() if store.is_initialized() else data["base_tratada"]

    # Re-validate with current base
    all_issues: List[Dict] = []
    if base is not None and "aba_origem" in base.columns:
        for sheet_name in base["aba_origem"].unique():
            df_sheet = base[base["aba_origem"] == sheet_name].copy()
            all_issues.extend(validate_data(df_sheet, sheet_name))

    # Recalculate KPIs
    kpis     = calculate_kpis(base) if base is not None and len(base) > 0 else {}
    comments = generate_executive_comments(kpis, base) if base is not None else {}

    correction_log        = store.get_correction_log() if store.is_initialized() else []
    category_transitions  = kpis.get("category_transitions", [])

    try:
        output_path = export_excel(
            original_sheets=data["original_sheets_raw"],
            base_tratada=base,
            validations=all_issues,
            kpis=kpis,
            comments=comments,
            correction_log=correction_log,
            category_transitions=category_transitions,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar exportação: {exc}")

    return FileResponse(
        path=output_path,
        filename="Dashboard_Mov_gado_Fazenda_Morro_Branco_Corrigido.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
