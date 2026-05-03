import uuid
import pandas as pd
import numpy as np
import unicodedata
import re
from typing import Dict, Any, Optional, List

# Sex normalization patterns
_MALE_RE   = re.compile(r"^(m|macho|male|masculino|m\.?)$", re.IGNORECASE)
_FEMALE_RE = re.compile(r"^(f|femea|fêmea|female|feminino|f\.?)$", re.IGNORECASE)

# Event classification patterns (NFKD-normalized, uppercase)
_ENTRADA_RE = re.compile(r"ENTRADA|COMPRA|NASC|AQUISIC|RETORNO|INCORPORA")
_SAIDA_RE   = re.compile(r"SAIDA|SAIDA|VENDA|MORTE|ABATE|BAIXA|DESCARTE|TRANSFER")


def _norm_text(s: str) -> str:
    """NFKD normalize + uppercase for accent-insensitive comparison."""
    return (
        unicodedata.normalize("NFKD", str(s))
        .encode("ascii", errors="ignore")
        .decode("ascii")
        .upper()
        .strip()
    )


def _compute_categoria_calculada(idade, sexo_norm: str) -> str:
    """Classify animal category from age (months) and normalized sex."""
    try:
        idade_f = float(idade)
    except (TypeError, ValueError):
        return "Categoria não identificada"

    if pd.isna(idade_f) or idade_f < 0:
        return "Categoria não identificada"

    is_male   = bool(_MALE_RE.match(sexo_norm))
    is_female = bool(_FEMALE_RE.match(sexo_norm))

    if 0 <= idade_f <= 12:
        return "Bezerro"
    elif 13 <= idade_f <= 24:
        if is_male:
            return "Garrote"
        if is_female:
            return "Novilha"
        return "Categoria não identificada"
    elif 25 <= idade_f <= 36:
        if is_male:
            return "Boi"
        if is_female:
            return "Vaca"
        return "Categoria não identificada"
    else:
        # 37+ months
        if is_male:
            return "Boi 37+"
        if is_female:
            return "Vaca 37+"
        return "Categoria não identificada"


def clean_dataframe(df: pd.DataFrame, col_mapping: Dict[str, str]) -> pd.DataFrame:
    df = df.copy()

    reverse_mapping = {v: k for k, v in col_mapping.items()}
    df = df.rename(columns=reverse_mapping)

    # === DATA ===
    if "data" in df.columns:
        df["data"] = pd.to_datetime(df["data"], errors="coerce", dayfirst=True)
        df["mes"]      = df["data"].dt.month
        df["ano"]      = df["data"].dt.year
        df["mes_ano"]  = df["data"].dt.strftime("%Y-%m")
        df["mes_nome"] = df["data"].dt.strftime("%m/%Y")

    # === DATA PESAGEM ===
    if "data_pesagem" in df.columns:
        col = df["data_pesagem"]
        if pd.api.types.is_numeric_dtype(col):
            # Excel stores dates as days since 1899-12-30; anything < 1000 is invalid
            valid = col.where(col > 1000, other=np.nan)
            df["data_pesagem"] = pd.to_datetime(valid, unit="D", origin="1899-12-30", errors="coerce")
        else:
            df["data_pesagem"] = pd.to_datetime(col, errors="coerce", dayfirst=True)
        # semana_ano derived from data_pesagem for weekly granularity
        dp = df["data_pesagem"]
        iso = dp.dt.isocalendar()
        df["semana_ano"] = (
            "Sem " +
            iso["week"].astype(str).str.zfill(2) +
            "/" +
            dp.dt.year.astype(str)
        )
        df["semana_ano"] = df["semana_ano"].where(dp.notna(), other=None)
        # mes_pesagem for monthly grouping when using data_pesagem
        df["mes_pesagem"] = dp.dt.strftime("%Y-%m").where(dp.notna(), other=None)

    # === PESO — extração do inteiro com detecção correta do separador decimal ===
    # "486,92" ou "486.92" → 486  |  "1.234,56" → 1234  |  48692.0 (float) → 48692
    # O ponto sozinho com ≤2 dígitos depois é decimal (ex: "486.92"); com 3 é milhar.
    def _peso_to_int(val):
        if pd.isna(val):
            return pd.NA
        if isinstance(val, (int, float, np.integer, np.floating)):
            return int(val)  # célula numérica: 486.92 → 486
        s = str(val).strip().replace("R$", "").replace("\xa0", "").replace(" ", "")
        if not s or s.lower() in ("nan", "none", "na", ""):
            return pd.NA
        # Encontrar o separador decimal: último "." ou "," com ≤2 dígitos após
        dec_pos = -1
        for i, ch in enumerate(s):
            if ch in ".,":
                digits_after = sum(1 for c in s[i + 1:] if c.isdigit())
                frac_len = len(s) - i - 1
                if frac_len <= 2:
                    dec_pos = i
        integer_str = re.sub(r"[^\d]", "", s[:dec_pos] if dec_pos != -1 else s)
        return int(integer_str) if integer_str else pd.NA

    if "peso" in df.columns:
        df["peso"] = df["peso"].apply(_peso_to_int).astype("Int64")

    # === NUMÉRICOS (demais colunas) ===
    for col in ["quantidade", "entrada", "saida", "valor", "idade"]:
        if col in df.columns:
            if df[col].dtype == object:
                df[col] = (
                    df[col]
                    .astype(str)
                    .str.replace("R$", "", regex=False)
                    .str.replace(".", "", regex=False)
                    .str.replace(",", ".", regex=False)
                    .str.strip()
                )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # === TEXTOS ===
    text_cols = [
        "fazenda", "lote", "categoria", "tipo_movimentacao", "evento",
        "origem", "destino", "observacao", "id_animal", "documento", "sexo",
    ]
    for col in text_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.strip()
                .str.title()
            )
            df[col] = df[col].replace({"Nan": None, "None": None, "": None, "Na": None})

    # === ID (brinco / identificação individual) ===
    # Treated as text only — NO title-case to preserve zeros and original format.
    # If no column literally named "ID" was found, use id_animal as the unified id field.
    if "id" not in df.columns and "id_animal" in df.columns:
        df["id"] = df["id_animal"]

    if "id" in df.columns:
        df["id"] = (
            df["id"]
            .astype(str)
            .str.strip()
        )
        df["id"] = df["id"].replace({"nan": None, "NaN": None, "None": None, "": None, "NA": None, "na": None})

    # === SEXO normalizado ===
    # Build a raw sexo_norm column for Categoria_Calculada computation
    if "sexo" in df.columns:
        df["sexo_norm"] = df["sexo"].astype(str).str.strip()
    elif "categoria" in df.columns:
        # categoria might contain sex values (M/F)
        df["sexo_norm"] = df["categoria"].astype(str).str.strip()
    else:
        df["sexo_norm"] = ""

    # === TIPO DE MOVIMENTAÇÃO — normaliza ENTRADA/SAÍDA ===
    if "tipo_movimentacao" in df.columns:
        df["tipo_movimentacao_norm"] = (
            df["tipo_movimentacao"]
            .astype(str)
            .str.upper()
            .str.strip()
            .str.normalize("NFKD")
            .str.encode("ascii", errors="ignore")
            .str.decode("ascii")
        )

    # === EVENTO normalizado ===
    if "evento" in df.columns:
        df["evento_norm"] = (
            df["evento"]
            .astype(str)
            .str.upper()
            .str.strip()
            .str.normalize("NFKD")
            .str.encode("ascii", errors="ignore")
            .str.decode("ascii")
        )
        df["evento_norm"] = df["evento_norm"].replace({"NAN": None, "NONE": None, "": None})

    # === PESO: corrigir sinal automático para SAÍDA ===
    # Se Tipo de Movimentação = SAIDA e Peso > 0 → inverter para negativo
    if "peso" in df.columns and "tipo_movimentacao_norm" in df.columns:
        saida_mask   = df["tipo_movimentacao_norm"].str.contains("SAIDA", na=False)
        pos_mask     = df["peso"].notna() & (df["peso"] > 0)
        correct_mask = saida_mask & pos_mask
        df["peso_original"] = np.nan
        if correct_mask.any():
            df.loc[correct_mask, "peso_original"] = df.loc[correct_mask, "peso"]
            df.loc[correct_mask, "peso"]          = -df.loc[correct_mask, "peso"]
        df["peso_corrigido_auto"] = correct_mask
    else:
        df["peso_original"]       = np.nan
        df["peso_corrigido_auto"] = False

    # === CATEGORIA_CALCULADA ===
    # Requires idade (months) and sexo_norm
    has_idade = "idade" in df.columns and df["idade"].notna().any()
    if has_idade:
        df["categoria_calculada"] = df.apply(
            lambda row: _compute_categoria_calculada(
                row.get("idade"), row.get("sexo_norm", "")
            ),
            axis=1,
        )
    else:
        df["categoria_calculada"] = "Categoria não identificada"

    # === CAMPO AUXILIAR: quantidade ===
    if "quantidade" not in df.columns:
        if "entrada" in df.columns and "saida" in df.columns:
            df["quantidade"] = df["entrada"].fillna(0) + df["saida"].fillna(0)
        elif "entrada" in df.columns:
            df["quantidade"] = df["entrada"]
        elif "saida" in df.columns:
            df["quantidade"] = df["saida"]
        else:
            df["quantidade"] = 1

    # === CAMPOS DERIVADOS: entrada / saída (from evento first, then tipo_movimentacao) ===
    if "evento_norm" in df.columns:
        if "entrada" not in df.columns:
            df["entrada"] = df["evento_norm"].apply(
                lambda x: 1 if isinstance(x, str) and _ENTRADA_RE.search(x) else 0
            )
        if "saida" not in df.columns:
            df["saida"] = df["evento_norm"].apply(
                lambda x: 1 if isinstance(x, str) and _SAIDA_RE.search(x) else 0
            )
    elif "tipo_movimentacao_norm" in df.columns:
        if "entrada" not in df.columns:
            df["entrada"] = df["tipo_movimentacao_norm"].apply(
                lambda x: 1 if "ENTRADA" in str(x) else 0
            )
        if "saida" not in df.columns:
            df["saida"] = df["tipo_movimentacao_norm"].apply(
                lambda x: 1 if "SAIDA" in str(x) else 0
            )

    # === CATEGORIA: fallback to sexo if categoria not mapped ===
    if "categoria" not in df.columns and "sexo" in df.columns:
        df["categoria"] = df["sexo"]

    return df


def prepare_base_tratada(excel_data: Dict[str, Any]) -> Optional[pd.DataFrame]:
    dfs: List[pd.DataFrame] = []

    for sheet_name, structure in excel_data["structure"].items():
        if structure.get("is_empty") or "error" in structure:
            continue

        df_raw = excel_data["sheets"].get(sheet_name)
        if df_raw is None or len(df_raw) == 0:
            continue

        col_mapping = structure.get("column_mapping", {})
        detected_header_row = structure.get("detected_header_row", 0)

        df_clean = clean_dataframe(df_raw.copy(), col_mapping)
        df_clean["aba_origem"] = sheet_name

        # Excel row number (approximate): header is at detected_header_row (0-indexed),
        # so data starts at Excel row detected_header_row + 2 (1-indexed).
        # df_clean.index is 0-based after reset_index in read_excel_file.
        df_clean["excel_row_number"] = df_clean.index + detected_header_row + 2

        # Unique identifier for each row (used for record editing and validation linkage)
        df_clean["registro_id"] = [str(uuid.uuid4()) for _ in range(len(df_clean))]

        dfs.append(df_clean)

    if not dfs:
        return None

    base = pd.concat(dfs, ignore_index=True)
    for col in ["quantidade", "peso", "valor"]:
        if col not in base.columns:
            base[col] = np.nan
    return base
