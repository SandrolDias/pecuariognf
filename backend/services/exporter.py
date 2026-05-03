import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

OUTPUT_DIR = Path(__file__).parent.parent / "outputs"


def _safe_sheet_name(name: str) -> str:
    """Garante que o nome da aba respeita o limite de 31 caracteres do Excel."""
    return str(name)[:31]


def _df_to_safe(df: pd.DataFrame) -> pd.DataFrame:
    """Converte colunas datetime para string para evitar erros de serialização."""
    df = df.copy()
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].dt.strftime("%d/%m/%Y").fillna("")
        elif df[col].dtype == object:
            df[col] = df[col].fillna("").astype(str)
    return df


def export_excel(
    original_sheets: Dict[str, pd.DataFrame],
    base_tratada: Optional[pd.DataFrame],
    validations: List[Dict],
    kpis: Dict[str, Any],
    comments: Dict[str, str],
    correction_log: Optional[List[Dict]] = None,
    category_transitions: Optional[List[Dict]] = None,
    filename: str = "Dashboard_Mov_gado_Fazenda_Morro_Branco_Corrigido.xlsx",
) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / filename

    with pd.ExcelWriter(str(output_path), engine="openpyxl") as writer:

        # ── Abas originais ───────────────────────────────────────────────────
        for sheet_name, df in original_sheets.items():
            safe_name = _safe_sheet_name(f"ORIG_{sheet_name}")
            _df_to_safe(df).to_excel(writer, sheet_name=safe_name, index=False)

        # ── BASE_TRATADA (corrigida) ─────────────────────────────────────────
        if base_tratada is not None and len(base_tratada) > 0:
            # Exclude system/internal columns from export
            export_bt = base_tratada.copy()
            internal_cols = {
                "sexo_norm", "evento_norm", "tipo_movimentacao_norm",
                "semana_ano", "mes_pesagem", "mes_ano", "mes", "ano",
                "mes_nome", "entrada", "saida", "peso_corrigido_auto",
            }
            keep_cols = [c for c in export_bt.columns if c not in internal_cols]
            _df_to_safe(export_bt[keep_cols]).to_excel(
                writer, sheet_name="BASE_TRATADA", index=False
            )

        # ── VALIDACOES ───────────────────────────────────────────────────────
        if validations:
            df_val = pd.DataFrame(validations)
            col_order = [
                "nr", "registro_id", "id_brinco", "aba", "linha",
                "excel_row_number", "coluna", "tipo_erro",
                "criticidade", "descricao", "impacto", "acao_recomendada",
                "valor_original", "valor_corrigido", "status",
            ]
            col_order = [c for c in col_order if c in df_val.columns]
            df_val[col_order].to_excel(writer, sheet_name="VALIDACOES", index=False)
        else:
            pd.DataFrame(
                columns=["nr", "registro_id", "id_brinco", "aba", "linha",
                         "coluna", "tipo_erro", "criticidade",
                         "descricao", "impacto", "acao_recomendada", "status"]
            ).to_excel(writer, sheet_name="VALIDACOES", index=False)

        # ── KPIS ─────────────────────────────────────────────────────────────
        kpi_rows = []
        list_kpis = {}
        for k, v in kpis.items():
            if isinstance(v, list):
                list_kpis[k] = v
            elif isinstance(v, dict):
                pass  # skip dicts (metric_definitions, chart_titles, etc.)
            else:
                kpi_rows.append({"Indicador": k, "Valor": str(v)})
        if kpi_rows:
            pd.DataFrame(kpi_rows).to_excel(writer, sheet_name="KPIS", index=False)

        # ── DADOS_DASHBOARD (listas dos KPIs) ────────────────────────────────
        start_col = 0
        ws_name = "DADOS_DASHBOARD"
        first = True
        for key, records in list_kpis.items():
            if not records or key in ("category_transitions",):
                continue  # skip large transition list from dashboard data
            try:
                df_part = pd.DataFrame(records)
                if first:
                    df_part.to_excel(writer, sheet_name=ws_name,
                                     startrow=0, startcol=start_col, index=False)
                    first = False
                else:
                    df_part.to_excel(writer, sheet_name=ws_name,
                                     startrow=0, startcol=start_col, index=False)
                start_col += len(df_part.columns) + 1
            except Exception:
                pass
        if first:
            pd.DataFrame({"info": ["Sem dados suficientes para exibição."]}).to_excel(
                writer, sheet_name=ws_name, index=False
            )

        # ── RESUMO_EXECUTIVO ─────────────────────────────────────────────────
        resumo_label = {
            "principal_movimentacao": "Principal Movimentação",
            "categoria_relevante":    "Categoria Mais Relevante",
            "fazenda_concentracao":   "Fazenda com Maior Concentração",
            "lote_movimentacao":      "Lote com Maior Movimentação",
            "saldo_rebanho":          "Saldo do Rebanho",
            "inconsistencias":        "Inconsistências",
            "riscos":                 "Riscos Identificados",
            "recomendacoes":          "Recomendações",
        }
        rows = [
            {"Tópico": resumo_label.get(k, k), "Comentário Executivo": v}
            for k, v in comments.items()
        ]
        rows.append({
            "Tópico": "Data de Geração",
            "Comentário Executivo": datetime.now().strftime("%d/%m/%Y %H:%M"),
        })
        pd.DataFrame(rows).to_excel(writer, sheet_name="RESUMO_EXECUTIVO", index=False)

        # ── LOG_CORRECOES ─────────────────────────────────────────────────────
        if correction_log:
            df_log = pd.DataFrame(correction_log)
            col_order = [
                "timestamp", "registro_id", "id_brinco", "excel_row_number",
                "campo", "valor_anterior", "valor_novo", "status",
            ]
            col_order = [c for c in col_order if c in df_log.columns]
            # Rename for display
            df_log = df_log[col_order].rename(columns={
                "timestamp":       "Data/Hora Correção",
                "registro_id":     "Registro ID",
                "id_brinco":       "ID / Brinco",
                "excel_row_number": "Linha Excel",
                "campo":           "Campo Alterado",
                "valor_anterior":  "Valor Anterior",
                "valor_novo":      "Valor Novo",
                "status":          "Status",
            })
            df_log.to_excel(writer, sheet_name="LOG_CORRECOES", index=False)
        else:
            pd.DataFrame(
                columns=["Data/Hora Correção", "Registro ID", "ID / Brinco",
                         "Linha Excel", "Campo Alterado", "Valor Anterior",
                         "Valor Novo", "Status"]
            ).to_excel(writer, sheet_name="LOG_CORRECOES", index=False)

        # ── TRANSICOES_CATEGORIA ──────────────────────────────────────────────
        if category_transitions:
            df_trans = pd.DataFrame(category_transitions)
            col_map = {
                "id":               "ID / Brinco",
                "categoria_inicial": "Categoria Inicial",
                "categoria_final":   "Categoria Final",
                "data_inicial":      "Data Inicial",
                "data_final":        "Data Final",
                "mudou_categoria":   "Mudou Categoria",
            }
            df_trans = df_trans.rename(columns=col_map)
            df_trans.to_excel(writer, sheet_name="TRANSICOES_CATEGORIA", index=False)
        else:
            pd.DataFrame(
                columns=["ID / Brinco", "Categoria Inicial", "Categoria Final",
                         "Data Inicial", "Data Final", "Mudou Categoria"]
            ).to_excel(writer, sheet_name="TRANSICOES_CATEGORIA", index=False)

    return str(output_path)
