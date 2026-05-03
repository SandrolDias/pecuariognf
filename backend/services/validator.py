"""
validator.py
Validates BASE_TRATADA (already cleaned) and returns a list of issue dicts.
Each issue includes registro_id, id_brinco and base_tratada_index so the
FrontEnd can open the correct record for correction.
"""
import re
import unicodedata
import pandas as pd
import numpy as np
from typing import List, Dict, Any

_ENTRADA_RE = re.compile(r"ENTRADA|COMPRA|NASC|AQUISIC|RETORNO|INCORPORA")
_SAIDA_RE   = re.compile(r"SAIDA|VENDA|MORTE|ABATE|BAIXA|DESCARTE|TRANSFER")
_MALE_RE    = re.compile(r"^(m|macho|male|masculino)$", re.IGNORECASE)
_FEMALE_RE  = re.compile(r"^(f|femea|fêmea|female|feminino)$", re.IGNORECASE)

_IDENTIFIED_CATS = {"Bezerro", "Garrote", "Novilha", "Boi", "Vaca", "Boi 37+", "Vaca 37+"}


def _norm(s: str) -> str:
    return (
        unicodedata.normalize("NFKD", str(s))
        .encode("ascii", errors="ignore")
        .decode("ascii")
        .upper()
        .strip()
    )


# ── Helper: look up registro_id and id_brinco for a given df row index ────────

def _row_ids(df: pd.DataFrame, idx) -> tuple:
    """Return (registro_id, id_brinco, excel_row_number) for a given df index."""
    reg_id = str(df.at[idx, "registro_id"]) if "registro_id" in df.columns else None
    id_br  = (
        str(df.at[idx, "id"]).strip()
        if "id" in df.columns and pd.notna(df.at[idx, "id"])
        else None
    )
    if id_br in ("nan", "none", "None", "", "NaN"):
        id_br = None
    excel_r = int(df.at[idx, "excel_row_number"]) if "excel_row_number" in df.columns else None
    return reg_id, id_br, excel_r


def _add(issues, counter, aba, linha, coluna, tipo, criticidade, descricao, impacto, acao,
         registro_id=None, id_brinco=None, base_tratada_index=None, excel_row=None,
         valor_original=None, valor_corrigido=None):
    counter[0] += 1
    # Resolve display line
    if isinstance(linha, (int, np.integer)):
        display_linha = int(linha) + 2
    else:
        display_linha = linha

    issues.append({
        "nr":                 counter[0],
        "registro_id":        registro_id,
        "id_brinco":          id_brinco,
        "base_tratada_index": base_tratada_index,
        "excel_row_number":   excel_row,
        "aba":                aba,
        "linha":              display_linha,
        "coluna":             str(coluna),
        "tipo_erro":          tipo,
        "criticidade":        criticidade,
        "descricao":          descricao,
        "impacto":            impacto,
        "acao_recomendada":   acao,
        "valor_original":     valor_original,
        "valor_corrigido":    valor_corrigido,
        "status":             "Pendente",
    })


def validate_data(df: pd.DataFrame, sheet_name: str) -> List[Dict[str, Any]]:
    issues: List[Dict] = []
    n = [0]

    # ── 1. Aba vazia ──────────────────────────────────────────────────────────
    if len(df) == 0:
        _add(issues, n, sheet_name, "N/A", "N/A", "Aba Vazia", "Alta",
             f"A aba '{sheet_name}' não contém registros.",
             "Nenhum dado disponível para análise.",
             "Verificar se a aba correta foi importada ou se há dados ocultos.")
        return issues

    # ── 2. Colunas sem nome (Unnamed) ─────────────────────────────────────────
    for col in df.columns:
        if "unnamed" in str(col).lower():
            _add(issues, n, sheet_name, "N/A", col, "Coluna Sem Nome", "Média",
                 f"Coluna sem nome identificada: '{col}'.",
                 "Dados podem ser ignorados ou perdidos no processamento.",
                 "Nomear a coluna no arquivo Excel.")

    # ══════════════════════════════════════════════════════════════════════════
    # ID / BRINCO — validações obrigatórias
    # ══════════════════════════════════════════════════════════════════════════

    # 3a. Coluna ID ausente (crítico)
    if "id" not in df.columns:
        _add(issues, n, sheet_name, "N/A", "ID", "Coluna ID Ausente", "Alta",
             "Coluna 'ID' não encontrada. O campo ID é obrigatório porque representa "
             "o brinco/identificação individual do animal.",
             "Análise de transição de categoria e rastreabilidade individual impossíveis.",
             "Adicionar a coluna 'ID' ao arquivo Excel com o brinco de cada animal.")
    else:
        # 3b. IDs vazios / nulos
        id_null_mask = df["id"].isna() | df["id"].astype(str).str.strip().isin(
            ["", "nan", "NaN", "None", "none", "NA", "na"]
        )
        cnt_null = int(id_null_mask.sum())
        if cnt_null > 0:
            # Generate one issue per row (up to 50)
            for idx in df[id_null_mask].index[:50]:
                reg_id, _, excel_r = _row_ids(df, idx)
                _add(issues, n, sheet_name, idx, "ID", "ID Vazio", "Alta",
                     "Registro sem ID. Não é possível identificar individualmente o animal.",
                     "Registro excluído da análise de transição de categoria e rastreabilidade.",
                     "Preencher o campo 'ID' com o brinco/identificador único do animal.",
                     registro_id=reg_id, id_brinco=None,
                     base_tratada_index=int(idx), excel_row=excel_r)
            if cnt_null > 50:
                _add(issues, n, sheet_name, "N/A", "ID", "ID Vazio (em massa)", "Alta",
                     f"{cnt_null} registros no total com ID vazio (exibindo primeiros 50).",
                     "Registros sem ID excluídos de análises individuais.",
                     "Preencher o campo 'ID' para todos os animais.")

        # 3c. IDs com espaços extras (já removidos pelo strip, mas avisar se houve)
        # (handled by strip in data_cleaner — informational only)

        # 3d. ID duplicado na mesma data de referência com mesmo Peso e Evento
        date_col = "data_pesagem" if "data_pesagem" in df.columns else ("data" if "data" in df.columns else None)
        if date_col:
            # Only consider rows with non-null ID and non-null date
            df_dup = df.dropna(subset=["id", date_col]).copy()
            df_dup = df_dup[~df_dup["id"].astype(str).str.strip().isin(
                ["", "nan", "NaN", "None"]
            )]
            if len(df_dup) > 0:
                dup_cols = ["id", date_col]
                extra = [c for c in ["peso", "evento"] if c in df_dup.columns]
                dup_cols_full = dup_cols + extra
                # Aggregate duplicates — one validation entry per unique key
                dup_mask = df_dup.duplicated(subset=dup_cols_full, keep=False)
                cnt_dup = int(dup_mask.sum())
                if cnt_dup > 0:
                    # Group to show unique combinations
                    dup_groups = df_dup[dup_mask].groupby(dup_cols_full, dropna=False)
                    for group_key, group in list(dup_groups)[:20]:
                        dup_ids = list(group.index)
                        id_val = str(group_key[0]) if isinstance(group_key, tuple) else str(group_key)
                        date_val = str(group_key[1]) if isinstance(group_key, tuple) else ""
                        reg_id = str(df.at[dup_ids[0], "registro_id"]) if "registro_id" in df.columns else None
                        _add(issues, n, sheet_name, dup_ids[0], "ID",
                             "ID Duplicado na Mesma Data", "Média",
                             f"ID '{id_val}' duplicado em {date_val} com mesmos dados "
                             f"({len(dup_ids)} ocorrências). Possível duplicidade de registro.",
                             "Dupla contagem pode distorcer KPIs e análise de categoria.",
                             "Verificar e remover registros duplicados.",
                             registro_id=reg_id, id_brinco=id_val,
                             base_tratada_index=int(dup_ids[0]))
                    if cnt_dup > 0:
                        _add(issues, n, sheet_name, "N/A", "ID",
                             "Resumo: ID Duplicado na Mesma Data", "Média",
                             f"{cnt_dup} registros com ID duplicado na mesma data de referência.",
                             "Dupla contagem distorce todos os KPIs.",
                             "Revisar e remover duplicatas do arquivo original.")

    # ── 4. Datas inválidas (data de movimentação) ─────────────────────────────
    if "data" in df.columns:
        mask = df["data"].isna()
        for idx in df[mask].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "data", "Data Inválida", "Alta",
                 "Data de movimentação ausente ou em formato não reconhecido.",
                 "Registro não pode ser classificado por período.",
                 "Preencher ou corrigir a data no formato DD/MM/AAAA.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 5. Data Pesagem ausente ────────────────────────────────────────────────
    if "data_pesagem" in df.columns:
        mask = df["data_pesagem"].isna()
        for idx in df[mask].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "data_pesagem", "Data de Pesagem Ausente", "Média",
                 "Registro sem data de pesagem preenchida.",
                 "Filtro de período e KPIs de pesagem ficam incompletos.",
                 "Preencher a Data de Pesagem no formato DD/MM/AAAA.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
    else:
        _add(issues, n, sheet_name, "N/A", "data_pesagem", "Coluna Data Pesagem Ausente", "Alta",
             "Coluna 'Data Pesagem' não encontrada na aba.",
             "Filtro de período e todos os KPIs de pesagem indisponíveis.",
             "Adicionar a coluna 'Data Pesagem' ao arquivo Excel.")

    # ── 6. Peso ausente ───────────────────────────────────────────────────────
    if "peso" in df.columns:
        mask = df["peso"].isna()
        for idx in df[mask].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "peso", "Peso Ausente", "Média",
                 "Campo 'Peso' está vazio.",
                 "KPI de peso médio e total ficará incompleto.",
                 "Preencher o peso do animal em quilogramas.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
    else:
        _add(issues, n, sheet_name, "N/A", "peso", "Coluna Peso Ausente", "Alta",
             "Coluna 'Peso' não encontrada na aba.",
             "Nenhum KPI de peso pode ser calculado.",
             "Adicionar a coluna 'Peso' ao arquivo Excel.")

    # ── 7. Peso negativo (ignorar SAÍDA — peso negativo em saída é esperado) ──
    if "peso" in df.columns:
        saida_mask = pd.Series(False, index=df.index)
        if "tipo_movimentacao_norm" in df.columns:
            saida_mask = df["tipo_movimentacao_norm"].str.contains("SAIDA", na=False)
        elif "tipo_movimentacao" in df.columns:
            saida_mask = df["tipo_movimentacao"].astype(str).str.upper().str.contains("SAIDA|SAÍDA", na=False)
        mask = df["peso"].notna() & (df["peso"] < 0) & ~saida_mask
        for idx in df[mask].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "peso", "Peso Negativo", "Alta",
                 f"Peso com valor negativo: {df.at[idx, 'peso']} kg.",
                 "Erro crítico nos indicadores de peso.",
                 "Corrigir o peso para valor positivo.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 8. Outliers de peso (> 3 desvios padrão) ──────────────────────────────
    if "peso" in df.columns and df["peso"].notna().sum() > 5:
        mean_p = df["peso"].mean()
        std_p  = df["peso"].std()
        if std_p > 0:
            mask = df["peso"].notna() & (np.abs(df["peso"] - mean_p) > 3 * std_p)
            for idx in df[mask].index:
                reg_id, id_br, excel_r = _row_ids(df, idx)
                _add(issues, n, sheet_name, idx, "peso",
                     "Outlier de Peso", "Baixa",
                     f"Peso {df.at[idx, 'peso']:.1f} kg muito distante da média ({mean_p:.1f} kg ± {std_p:.1f}).",
                     "Possível erro de digitação ou peso de lote lançado como individual.",
                     "Verificar se o valor corresponde ao animal individual.",
                     registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 9. Evento vazio/nulo ──────────────────────────────────────────────────
    if "evento" in df.columns:
        ev_null = df["evento"].isna() | (df["evento"].astype(str).str.strip() == "")
        for idx in df[ev_null].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "evento", "Evento Vazio", "Alta",
                 "Campo 'Evento' está vazio.",
                 "Entradas e Saídas não podem ser contabilizadas para este registro.",
                 "Preencher o campo 'Evento' com o tipo de movimentação (ex: Compra, Venda).",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
    else:
        _add(issues, n, sheet_name, "N/A", "evento", "Coluna Evento Ausente", "Alta",
             "Coluna 'Evento' não encontrada na aba.",
             "KPIs de Entrada/Saída indisponíveis.",
             "Adicionar coluna 'Evento' com o tipo de cada movimentação.")

    # ── 10. Evento não classificado (nem entrada nem saída) ───────────────────
    if "evento_norm" in df.columns:
        ev = df["evento_norm"].fillna("").astype(str)
        nao_class = ev.apply(
            lambda x: x.strip() not in ("NAN", "NONE", "") and
                      bool(x.strip()) and
                      not _ENTRADA_RE.search(x) and
                      not _SAIDA_RE.search(x)
        )
        unique_unclassified = ev[nao_class].unique()
        if len(unique_unclassified) > 0:
            for val in unique_unclassified[:20]:
                cnt = int((nao_class & (ev == val)).sum())
                _add(issues, n, sheet_name, "N/A", "evento",
                     "Evento Não Classificado", "Média",
                     f"Evento '{val}' ({cnt} registros) não é reconhecido como Entrada ou Saída.",
                     "Estes registros não são contabilizados nos KPIs de Entrada/Saída.",
                     f"Verificar se '{val}' é entrada ou saída e padronizar o nome.")

    # ── 11. Quantidades vazias ────────────────────────────────────────────────
    for qty_col in ["quantidade", "entrada", "saida"]:
        if qty_col in df.columns:
            for idx in df[df[qty_col].isna()].index:
                reg_id, id_br, excel_r = _row_ids(df, idx)
                _add(issues, n, sheet_name, idx, qty_col, "Quantidade Vazia", "Alta",
                     f"Campo '{qty_col}' está vazio.",
                     "KPI de rebanho pode estar incorreto.",
                     f"Preencher o campo '{qty_col}' com o valor correto.",
                     registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 12. Quantidades negativas ─────────────────────────────────────────────
    for qty_col in ["quantidade", "entrada", "saida"]:
        if qty_col in df.columns:
            mask = df[qty_col].notna() & (df[qty_col] < 0)
            for idx in df[mask].index:
                reg_id, id_br, excel_r = _row_ids(df, idx)
                _add(issues, n, sheet_name, idx, qty_col, "Quantidade Negativa", "Alta",
                     f"Campo '{qty_col}' com valor negativo: {df.at[idx, qty_col]}.",
                     "Distorção grave nos indicadores de rebanho.",
                     "Corrigir o valor para positivo ou verificar sinal da operação.",
                     registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 13. Valor negativo ────────────────────────────────────────────────────
    if "valor" in df.columns:
        mask = df["valor"].notna() & (df["valor"] < 0)
        for idx in df[mask].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "valor", "Valor Negativo", "Média",
                 f"Valor financeiro negativo: R$ {df.at[idx, 'valor']:.2f}.",
                 "Distorção em análises financeiras.",
                 "Verificar se é crédito/devolução ou erro de digitação.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 14. Outliers de valor (> 3 desvios padrão) ────────────────────────────
    if "valor" in df.columns and df["valor"].notna().sum() > 5:
        mean_v = df["valor"].mean()
        std_v  = df["valor"].std()
        if std_v > 0:
            mask = df["valor"].notna() & (np.abs(df["valor"] - mean_v) > 3 * std_v)
            for idx in df[mask].index:
                reg_id, id_br, excel_r = _row_ids(df, idx)
                _add(issues, n, sheet_name, idx, "valor",
                     "Outlier de Valor", "Baixa",
                     f"Valor R$ {df.at[idx, 'valor']:.2f} muito distante da média (R$ {mean_v:.2f}).",
                     "Possível erro de digitação ou transação atípica.",
                     "Verificar o valor da transação.",
                     registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)

    # ── 15. Sexo não identificado ─────────────────────────────────────────────
    if "sexo" in df.columns:
        sex_null = df["sexo"].isna() | (df["sexo"].astype(str).str.strip().isin(["", "Nan", "None"]))
        for idx in df[sex_null].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "sexo", "Sexo Não Identificado", "Média",
                 "Campo 'Sexo' está vazio ou não reconhecido.",
                 "Categorização automática (Categoria_Calculada) ficará como 'Categoria não identificada'.",
                 "Preencher com M (Macho) ou F (Fêmea).",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
        sex_invalid = (
            df["sexo"].notna() &
            ~df["sexo"].astype(str).str.strip().isin(["", "Nan", "None"]) &
            ~df["sexo"].astype(str).apply(lambda x: bool(_MALE_RE.match(str(x).strip()))) &
            ~df["sexo"].astype(str).apply(lambda x: bool(_FEMALE_RE.match(str(x).strip())))
        )
        unique_invalid = df[sex_invalid]["sexo"].dropna().unique()
        for val in unique_invalid[:10]:
            cnt = int(sex_invalid[df["sexo"] == val].sum())
            _add(issues, n, sheet_name, "N/A", "sexo",
                 "Sexo Inválido", "Média",
                 f"Valor de sexo '{val}' ({cnt} registros) não reconhecido (esperado: M ou F).",
                 "Categorização automática será 'Categoria não identificada'.",
                 f"Corrigir '{val}' para M (Macho) ou F (Fêmea).")
    elif "sexo_norm" not in df.columns:
        _add(issues, n, sheet_name, "N/A", "sexo", "Coluna Sexo Ausente", "Média",
             "Coluna 'Sexo' não encontrada na aba.",
             "Categorização automática por sexo indisponível.",
             "Adicionar coluna 'Sexo' com M ou F para cada animal.")

    # ── 16. Idade inválida (não numérica ou negativa) ─────────────────────────
    if "idade" in df.columns:
        mask_null = df["idade"].isna()
        for idx in df[mask_null].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "idade", "Idade Ausente", "Média",
                 "Campo 'Idade' está vazio.",
                 "Categorização automática indisponível para este registro.",
                 "Preencher a idade do animal em meses.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
        mask_neg = df["idade"].notna() & (df["idade"] < 0)
        for idx in df[mask_neg].index:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            _add(issues, n, sheet_name, idx, "idade", "Idade Negativa", "Alta",
                 f"Idade negativa: {df.at[idx, 'idade']} meses.",
                 "Categorização automática inválida.",
                 "Corrigir a idade para valor positivo em meses.",
                 registro_id=reg_id, id_brinco=id_br, base_tratada_index=int(idx), excel_row=excel_r)
    else:
        _add(issues, n, sheet_name, "N/A", "idade", "Coluna Idade Ausente", "Média",
             "Coluna 'Idade' não encontrada na aba.",
             "Categorização automática (Categoria_Calculada) indisponível.",
             "Adicionar coluna 'Idade' com idade em meses.")

    # ── 17. Categoria_Calculada não identificada ──────────────────────────────
    if "categoria_calculada" in df.columns:
        nao_id = df["categoria_calculada"].isin(
            ["Categoria não identificada", "Fora da regra de classificação"]
        )
        cnt_nao = int(nao_id.sum())
        if cnt_nao > 0:
            fora      = int((df["categoria_calculada"] == "Fora da regra de classificação").sum())
            sem_dados = cnt_nao - fora
            if sem_dados > 0:
                _add(issues, n, sheet_name, "N/A", "categoria_calculada",
                     "Categoria Calculada Não Identificada", "Média",
                     f"{sem_dados} registros sem categoria calculada por falta de Idade ou Sexo.",
                     "Gráfico de Animais por Categoria ficará incompleto.",
                     "Preencher Idade (meses) e Sexo (M/F) para todos os animais.")
            if fora > 0:
                _add(issues, n, sheet_name, "N/A", "categoria_calculada",
                     "Categoria Fora da Faixa de Classificação", "Baixa",
                     f"{fora} animais com Idade fora das faixas de classificação (>36 meses "
                     "sem sexo identificado).",
                     "Estes animais aparecem como 'Fora da regra de classificação' nos gráficos.",
                     "Verificar se as idades estão corretas (em meses, não anos) e se o Sexo está preenchido.")

    # ── 18. Registros duplicados (por campos-chave gerais) ────────────────────
    dup_cols = [c for c in ["data", "lote", "quantidade", "peso"] if c in df.columns]
    if len(dup_cols) >= 2:
        dup_mask = df.duplicated(subset=dup_cols, keep=False)
        cnt_dup = int(dup_mask.sum())
        if cnt_dup > 0:
            _add(issues, n, sheet_name, "N/A", ", ".join(dup_cols),
                 "Registros Duplicados", "Alta",
                 f"{cnt_dup} registros possivelmente duplicados (mesmos valores em campos-chave).",
                 "Dupla contagem pode distorcer todos os KPIs e indicadores.",
                 "Verificar e remover duplicatas no arquivo original.")

    # ── 19. Lote ausente ──────────────────────────────────────────────────────
    if "lote" in df.columns:
        cnt = int(df["lote"].isna().sum())
        if cnt > 0:
            _add(issues, n, sheet_name, "N/A", "lote", "Lote Ausente", "Média",
                 f"{cnt} registros sem identificação de lote.",
                 "Dificuldade de rastreabilidade e agrupamento por lote.",
                 "Preencher o campo 'Lote' para todos os animais.")

    # ── 20. Origem ausente ────────────────────────────────────────────────────
    if "origem" in df.columns:
        cnt = int(df["origem"].isna().sum())
        if cnt > 0:
            _add(issues, n, sheet_name, "N/A", "origem", "Origem Ausente", "Baixa",
                 f"{cnt} registros sem local de origem.",
                 "Rastreabilidade de entrada comprometida.",
                 "Preencher o campo 'Origem'.")

    # ── 21. Destino ausente ───────────────────────────────────────────────────
    if "destino" in df.columns:
        cnt = int(df["destino"].isna().sum())
        if cnt > 0:
            _add(issues, n, sheet_name, "N/A", "destino", "Destino Ausente", "Baixa",
                 f"{cnt} registros sem local de destino.",
                 "Rastreabilidade de saída comprometida.",
                 "Preencher o campo 'Destino'.")

    # ── 22. Peso corrigido automaticamente (SAÍDA com peso positivo invertido) ──
    if "peso_corrigido_auto" in df.columns:
        corrected_mask = df["peso_corrigido_auto"] == True
        for idx in df[corrected_mask].index[:100]:
            reg_id, id_br, excel_r = _row_ids(df, idx)
            peso_orig = df.at[idx, "peso_original"] if "peso_original" in df.columns else None
            peso_atual = df.at[idx, "peso"]
            _add(issues, n, sheet_name, idx, "peso",
                 "Peso Corrigido Automaticamente", "Média",
                 f"Peso de SAÍDA positivo ({peso_orig} kg) corrigido automaticamente para negativo ({peso_atual} kg).",
                 "Corrigido — KPI de peso total reflete o valor negativo para saídas.",
                 "Verificar se o peso original estava correto no arquivo fonte.",
                 registro_id=reg_id, id_brinco=id_br,
                 base_tratada_index=int(idx), excel_row=excel_r,
                 valor_original=float(peso_orig) if peso_orig is not None and not (isinstance(peso_orig, float) and pd.isna(peso_orig)) else None,
                 valor_corrigido=float(peso_atual) if pd.notna(peso_atual) else None)
        cnt_corr = int(corrected_mask.sum())
        if cnt_corr > 100:
            _add(issues, n, sheet_name, "N/A", "peso",
                 "Peso Corrigido Automaticamente (em massa)", "Média",
                 f"{cnt_corr} registros de SAÍDA tiveram peso positivo invertido automaticamente para negativo (exibindo primeiros 100).",
                 "Corrigido — KPIs de peso usam valores negativos para saídas.",
                 "Verificar se os pesos originais no arquivo fonte estão corretos.")

    # ── 23. Erros de digitação em categorias originais ───────────────────────
    if "categoria" in df.columns:
        cats = df["categoria"].dropna().unique()
        seen: List[str] = []
        for cat in cats:
            cat_lower = str(cat).lower().strip()
            for s in seen:
                s_lower = str(s).lower().strip()
                if cat_lower != s_lower and (
                    cat_lower.startswith(s_lower[:4]) or s_lower.startswith(cat_lower[:4])
                ) and abs(len(cat_lower) - len(s_lower)) <= 3:
                    _add(issues, n, sheet_name, "N/A", "categoria",
                         "Possível Erro de Digitação em Categoria", "Baixa",
                         f"Categorias similares encontradas: '{cat}' e '{s}'. Podem ser a mesma.",
                         "Fragmentação incorreta de categorias nos KPIs.",
                         f"Verificar e padronizar: '{cat}' e '{s}'.")
                    break
            seen.append(cat)

    return issues
