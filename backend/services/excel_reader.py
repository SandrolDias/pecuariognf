import pandas as pd
import unicodedata
import os
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"

# ── Expected header at row 11 (in order) ─────────────────────────────────────
EXPECTED_HEADER = [
    "Data",
    "ID Usual",
    "Sexo",
    "G. Sangue",
    "Documento",
    "Tipo de Movimentação",
    "Evento",
    "Idade",
    "Cliente/Fornecedor",
    "Pesagem",
    "Peso",
]

COLUMN_MAPPING = {
    # ── id (brinco/identificação individual do animal) ────────────────────────
    "id": ["id"],
    "data": [
        "data", "dt mov", "dt. mov", "dt.mov", "data movimento",
        "data movimentacao", "data movimentação", "date", "dt", "dt_mov",
        "data_mov", "data_movimentacao", "data mov",
    ],
    "fazenda": [
        "fazenda", "propriedade", "estabelecimento", "unidade", "farm",
        "fazenda origem", "nome fazenda", "local",
    ],
    "lote": [
        "lote", "lote animal", "identificação lote", "identificacao lote",
        "id lote", "numero lote", "nº lote", "num lote", "lote_animal",
        "id_lote", "lote finalidade", "finalidade",
    ],
    "categoria": [
        "categoria", "categoria animal", "tipo animal", "especie", "espécie",
        "raça", "raca", "classe", "categoria_animal", "classe animal",
        "g sangue", "g. sangue", "grau de sangue",
    ],
    "sexo": [
        "sexo", "genero", "gênero", "sex", "masculino feminino",
    ],
    "tipo_movimentacao": [
        "tipo movimentacao", "tipo mov", "tipo_movimentacao",
        "movimento", "movimentacao", "tipo_movimento",
        "natureza", "operacao", "tipo de movimentacao",
    ],
    "evento": [
        "evento", "sub-tipo", "sub tipo", "tipo evento",
        "compra venda", "natureza evento",
    ],
    "entrada": [
        "entrada", "entradas", "entrada cabeças", "entrada cabecas",
        "qtd entrada", "qtde entrada", "qt entrada", "cab entrada",
    ],
    "saida": [
        "saida", "saída", "saidas", "saídas", "saida cabeças",
        "saida cabecas", "qtd saida", "qtd saída", "cab saida",
    ],
    "quantidade": [
        "quantidade", "qtd", "qtde", "nº cabeças", "n cabeças",
        "cabecas", "cabeças", "num cabeças", "total", "qt", "cab",
        "numero de cabecas", "número de cabeças",
    ],
    "peso": [
        "peso", "peso kg", "peso total", "kg", "peso vivo", "peso animal",
        "peso_kg", "peso_total", "peso vivo kg", "peso (kg)",
    ],
    "valor": [
        "valor", "valor total", "preco", "preço", "vl", "v total",
        "r$", "valor r$", "valor_total", "preco unitario", "preço unitário",
        "vlr", "vlr total", "vl total",
    ],
    "origem": [
        "origem", "local origem", "fazenda origem", "procedencia",
        "cliente fornecedor", "fornecedor", "cliente",
        "cliente/fornecedor",
    ],
    "destino": [
        "destino", "local destino", "fazenda destino", "fazenda_destino",
        "local_destino",
    ],
    "id_animal": [
        "id usual", "id animal", "identificacao", "identificação",
        "brinco", "chip", "numero animal", "nº animal",
    ],
    "idade": [
        "idade", "meses", "idade meses", "idade animal", "idade (meses)",
        "idade em meses",
    ],
    "data_pesagem": [
        "data pesagem", "dt pesagem", "data_pesagem", "data de pesagem",
        "pesagem", "data pesagem animal", "dt pesagem animal",
    ],
    "observacao": [
        "observacao", "observação", "obs", "obs.", "nota",
        "comentario", "comentário", "observacoes", "observações",
    ],
    "documento": [
        "documento", "doc", "nf", "nota fiscal", "numero documento",
    ],
}


def find_mov_gado_file() -> Optional[str]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for ext in [".xlsx", ".xlsm", ".xls"]:
        for name in ["Mov_gado", "mov_gado", "MOV_GADO", "Mov_Gado", "MOV_Gado"]:
            path = UPLOAD_DIR / f"{name}{ext}"
            if path.exists():
                return str(path)
    for f in UPLOAD_DIR.glob("*"):
        if "mov_gado" in f.name.lower() and f.suffix.lower() in [".xlsx", ".xls", ".xlsm"]:
            return str(f)
    return None


def normalize_col(col: str) -> str:
    text = str(col).lower().strip()
    text = unicodedata.normalize("NFKD", text).encode("ascii", errors="ignore").decode("ascii")
    for ch in ["_", "-", ".", "/", "(", ")"]:
        text = text.replace(ch, " ")
    while "  " in text:
        text = text.replace("  ", " ")
    return text.strip()


def map_columns(df_columns: List[str]) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for col in df_columns:
        norm = normalize_col(col)
        for standard, variants in COLUMN_MAPPING.items():
            if standard in mapping:
                continue
            if norm in variants:
                mapping[standard] = col
                break
            norm_ascii = norm.encode("ascii", errors="ignore").decode("ascii").strip()
            if norm_ascii in variants or any(
                v.encode("ascii", errors="ignore").decode("ascii") == norm_ascii
                for v in variants
            ):
                mapping[standard] = col
                break
    return mapping


def _norm_text(s: str) -> str:
    """NFKD-normalize, strip accents, lowercase for comparison."""
    return (
        unicodedata.normalize("NFKD", str(s))
        .encode("ascii", errors="ignore")
        .decode("ascii")
        .lower()
        .strip()
    )


def _validate_header(header_values: list) -> List[Dict]:
    """
    Compare actual header row against EXPECTED_HEADER.
    Returns a list of mismatch dicts (one per differing column).
    """
    issues = []
    for i, exp in enumerate(EXPECTED_HEADER):
        found = header_values[i] if i < len(header_values) else None
        # Treat NaN/None as missing
        if found is None or (isinstance(found, float) and pd.isna(found)):
            found_str = "N/A (coluna ausente)"
        else:
            found_str = str(found).strip()

        if _norm_text(found_str) != _norm_text(exp):
            issues.append({
                "coluna_pos":      i + 1,
                "nome_encontrado": found_str,
                "nome_esperado":   exp,
            })
    return issues


def _preprocess_sheet(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, Dict]:
    """
    Apply import preprocessing rules before header extraction:
      1. Remove rows 1-10 (index 0-9 in the raw no-header DataFrame).
      2. Row 11 (index 0 after step 1) → treated as the header.
      3. Row 12 (index 1 after step 1, index 0 of data) → also removed.
      4. Data begins at row 13 (index 2 after step 1).
      5. Scan column A for "Estoque Final"; remove that row + the next 15 rows.

    Returns (df_cleaned, removal_log).
    df_cleaned still has the header row at index 0 and data from index 1 onward
    (caller must split: header = iloc[0], data = iloc[1:]).
    The row 12 removal is done inside this function by removing what becomes
    index 1 after the header row.

    Actually we return the raw preprocessed frame (header at 0, row-12 at 1, data at 2+).
    read_excel_file uses iloc[0] for header and iloc[2:] for data.
    """
    removal_log: Dict = {
        "linhas_1_10_removidas": 0,
        "linha_12_removida": True,          # always removed after preprocessing
        "estoque_final_encontrado": False,
        "estoque_final_linha_excel": None,
        "linhas_removidas_apos_estoque_final": 0,
        "total_linhas_removidas": 0,
        "header_validation_issues": [],
    }

    if len(df_raw) == 0:
        return df_raw.copy(), removal_log

    # ── Step 1: remove first 10 rows ─────────────────────────────────────────
    rows_to_skip = min(10, len(df_raw))
    removal_log["linhas_1_10_removidas"] = rows_to_skip
    df = df_raw.iloc[rows_to_skip:].reset_index(drop=True)

    # ── Step 2: validate header (row at index 0 = Excel row 11) ──────────────
    if len(df) > 0:
        header_values = df.iloc[0].tolist()
        removal_log["header_validation_issues"] = _validate_header(header_values)

    # ── Step 3: find "Estoque Final" in column A (data rows = index 2+) ───────
    # We scan starting from index 2 so we don't match a header/row-12 with "estoque final"
    if len(df) > 2 and len(df.columns) > 0:
        # Scan data portion (index 2 onward, i.e. Excel rows 13+)
        data_portion = df.iloc[2:].reset_index(drop=False)  # keep original index in 'index' col
        first_col_norm = data_portion.iloc[:, 1 if "index" in data_portion.columns else 0].apply(_norm_text)
        # data_portion has 'index' as first col; actual data starts at col 1 when reset_index(drop=False)
        # Simpler: work directly on df
        data_slice = df.iloc[2:]
        first_col_norm2 = data_slice.iloc[:, 0].apply(_norm_text)
        ef_mask = first_col_norm2.str.contains("estoque final", na=False)
        ef_indices = data_slice.index[ef_mask].tolist()

        if ef_indices:
            ef_idx = ef_indices[0]
            # Excel row (1-indexed) = rows_to_skip (10) + ef_idx + 1
            removal_log["estoque_final_encontrado"] = True
            removal_log["estoque_final_linha_excel"] = rows_to_skip + ef_idx + 1

            end_idx = min(ef_idx + 16, len(df))
            rows_to_remove = list(range(ef_idx, end_idx))
            removal_log["linhas_removidas_apos_estoque_final"] = len(rows_to_remove) - 1

            df = df.drop(index=rows_to_remove).reset_index(drop=True)

    total_removed = (
        removal_log["linhas_1_10_removidas"]
        + 1  # row 12 always removed
        + (1 + removal_log["linhas_removidas_apos_estoque_final"]
           if removal_log["estoque_final_encontrado"] else 0)
    )
    removal_log["total_linhas_removidas"] = total_removed

    return df, removal_log


def _fix_peso_after_data_pesagem(df: pd.DataFrame, col_mapping: Dict[str, str]) -> Dict[str, str]:
    """
    If data_pesagem is mapped but peso is not, check the column immediately
    after data_pesagem in the original DataFrame and use it as peso if it
    contains predominantly numeric data.
    """
    if "data_pesagem" not in col_mapping or "peso" in col_mapping:
        return col_mapping

    dp_col = col_mapping["data_pesagem"]
    cols = list(df.columns)
    try:
        dp_idx = cols.index(dp_col)
    except ValueError:
        return col_mapping

    next_idx = dp_idx + 1
    if next_idx >= len(cols):
        return col_mapping

    next_col = cols[next_idx]
    if next_col in col_mapping.values():
        return col_mapping

    series = pd.to_numeric(df[next_col], errors="coerce")
    non_null = series.notna().sum()
    if non_null > 0 and non_null / max(len(df), 1) > 0.1:
        col_mapping = dict(col_mapping)
        col_mapping["peso"] = next_col

    return col_mapping


def read_excel_file(file_path: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "file_path": file_path,
        "sheets": {},
        "structure": {},
    }

    xl = pd.ExcelFile(file_path)
    for sheet_name in xl.sheet_names:
        try:
            # ── Read raw (no header) so we can preprocess ─────────────────────
            df_raw = pd.read_excel(file_path, sheet_name=sheet_name, header=None)

            # ── Apply preprocessing (skip 1-10, validate header, skip row 12) ─
            df_preprocessed, removal_log = _preprocess_sheet(df_raw)

            if len(df_preprocessed) == 0:
                result["structure"][sheet_name] = {
                    "rows": 0,
                    "rows_before_dropna": 0,
                    "rows_dropped_empty": 0,
                    "columns": 0,
                    "column_names": [],
                    "column_mapping": {},
                    "is_empty": True,
                    # +1 accounts for row 12 also being skipped
                    "detected_header_row": removal_log["linhas_1_10_removidas"] + 1,
                    "removal_log": removal_log,
                }
                result["sheets"][sheet_name] = pd.DataFrame()
                continue

            # ── Row 0  → header; Row 1 → skipped (row 12 of Excel); Row 2+ → data
            header_values = df_preprocessed.iloc[0].tolist()
            # Skip both the header row AND row 12 (iloc[2:] instead of iloc[1:])
            df = df_preprocessed.iloc[2:].copy()
            df.columns = [
                str(h) if (h is not None and not (isinstance(h, float) and pd.isna(h)))
                else f"Unnamed: {i}"
                for i, h in enumerate(header_values)
            ]
            df = df.reset_index(drop=True)

            rows_before_dropna = len(df)
            df = df.dropna(how="all").reset_index(drop=True)
            df = df.dropna(axis=1, how="all")
            rows_dropped = rows_before_dropna - len(df)

            col_mapping = map_columns(list(df.columns))
            col_mapping = _fix_peso_after_data_pesagem(df, col_mapping)

            result["sheets"][sheet_name] = df
            result["structure"][sheet_name] = {
                "rows": len(df),
                "rows_before_dropna": rows_before_dropna,
                "rows_dropped_empty": rows_dropped,
                "columns": len(df.columns),
                "column_names": list(df.columns),
                "column_mapping": col_mapping,
                "is_empty": len(df) == 0,
                # +1: row 12 is also skipped before data begins at row 13
                # data_cleaner uses this as: excel_row_number = index + detected_header_row + 2
                # → first row: 0 + 11 + 2 = 13  ✓
                "detected_header_row": removal_log["linhas_1_10_removidas"] + 1,
                "removal_log": removal_log,
            }
        except Exception as e:
            result["structure"][sheet_name] = {
                "rows": 0,
                "rows_before_dropna": 0,
                "rows_dropped_empty": 0,
                "columns": 0,
                "column_names": [],
                "column_mapping": {},
                "is_empty": True,
                "error": str(e),
                "detected_header_row": 11,
                "removal_log": {},
            }

    return result
