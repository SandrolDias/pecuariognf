import math
import re
import unicodedata
from datetime import date
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional

NA_MSG = "Indicador não calculado por ausência de dados suficientes."

_ENTRADA_RE = re.compile(r"ENTRADA|COMPRA|NASC|AQUISIC|RETORNO|INCORPORA")
_SAIDA_RE   = re.compile(r"SAIDA|VENDA|MORTE|ABATE|BAIXA|DESCARTE|TRANSFER")
_MORTE_RE   = re.compile(r"MORTE|MORTALIDADE|MORTO|OBITO|BAIXA")

_MALE_RE   = re.compile(r"^M(ACHO)?$")
_FEMALE_RE = re.compile(r"^F(EMEA)?$")


def _cat_from_age_sex(idade_months: float, sexo_norm: str) -> str:
    """Vectorizable category computation (mirrors data_cleaner._compute_categoria_calculada)."""
    try:
        a = float(idade_months)
    except (TypeError, ValueError):
        return "Categoria não identificada"
    if pd.isna(a) or a < 0:
        return "Categoria não identificada"
    is_male   = bool(_MALE_RE.match(str(sexo_norm)))
    is_female = bool(_FEMALE_RE.match(str(sexo_norm)))
    if a <= 12:
        return "Bezerro"
    if a <= 24:
        return "Garrote" if is_male else ("Novilha" if is_female else "Categoria não identificada")
    if a <= 36:
        return "Boi" if is_male else ("Vaca" if is_female else "Categoria não identificada")
    return "Boi 37+" if is_male else ("Vaca 37+" if is_female else "Categoria não identificada")


def calculate_category_change_by_age(df: pd.DataFrame, reference_date: Optional[str] = None) -> Dict[str, Any]:
    """
    For ENTRADA rows: compute category at arrival and current category.
    Formula: meses_desde_entrada = (reference_date - data) in months
             idade_na_entrada = idade - meses_desde_entrada
    reference_date defaults to today; use filter end_date when set.
    Returns age_category_changes list grouped by (categoria_entrada, categoria_atual).
    """
    if reference_date:
        try:
            today = pd.Timestamp(reference_date)
        except Exception:
            today = pd.Timestamp(date.today())
    else:
        today = pd.Timestamp(date.today())

    required = {"data", "idade", "sexo_norm"}
    if not required.issubset(df.columns):
        return {"age_category_changes": [], "age_cat_summary": {}}

    # Filter to ENTRADA rows only
    if "tipo_movimentacao_norm" in df.columns:
        entrada_mask = df["tipo_movimentacao_norm"].str.contains(_ENTRADA_RE.pattern, na=False)
    else:
        entrada_mask = pd.Series(True, index=df.index)

    sub = df[entrada_mask].copy()
    sub = sub[sub["data"].notna() & sub["idade"].notna()]
    if sub.empty:
        return {"age_category_changes": [], "age_cat_summary": {}}

    sub["data"] = pd.to_datetime(sub["data"], errors="coerce")
    sub = sub[sub["data"].notna()]
    sub = sub[sub["data"].dt.year >= 2000]
    if sub.empty:
        return {"age_category_changes": [], "age_cat_summary": {}}

    # Months since entry (floor at 0)
    sub["meses_desde_entrada"] = (
        ((today - sub["data"]).dt.days / 30.44)
        .clip(lower=0)
        .round(0)
    )

    sub["idade_na_entrada"] = (sub["idade"] - sub["meses_desde_entrada"]).clip(lower=0)

    sub["categoria_entrada"] = sub.apply(
        lambda r: _cat_from_age_sex(r["idade_na_entrada"], r.get("sexo_norm", "")), axis=1
    )
    sub["categoria_atual"] = sub.apply(
        lambda r: _cat_from_age_sex(r["idade"], r.get("sexo_norm", "")), axis=1
    )

    changed = sub[sub["categoria_entrada"] != sub["categoria_atual"]]
    unchanged = sub[sub["categoria_entrada"] == sub["categoria_atual"]]

    total = len(sub)
    total_mudou = len(changed)

    grp = (
        changed.groupby(["categoria_entrada", "categoria_atual"], dropna=True)
        .size()
        .reset_index(name="quantidade")
    )
    grp["label"] = grp["categoria_entrada"] + " → " + grp["categoria_atual"]
    grp = grp.sort_values("quantidade", ascending=False)

    por_entrada = (
        sub.groupby("categoria_entrada", dropna=True)
        .size()
        .reset_index(name="total")
    )
    por_entrada = por_entrada.sort_values("total", ascending=False)

    # ── Timeline: estimate the month each animal crossed the category threshold ─
    # Min age (months) for each destination category
    _CAT_MIN = {
        "Garrote": 13, "Novilha": 13,
        "Boi": 25, "Vaca": 25,
        "Boi 37+": 37, "Vaca 37+": 37,
    }
    age_changes_timeline: List[Dict] = []
    if not changed.empty:
        ch = changed.copy()
        ch["threshold_age"]     = ch["categoria_atual"].map(_CAT_MIN).fillna(0)
        ch["meses_ate_mudanca"] = (ch["threshold_age"] - ch["idade_na_entrada"]).clip(lower=0)
        ch["data_mudanca"]      = ch["data"] + pd.to_timedelta(
            ch["meses_ate_mudanca"] * 30.44, unit="D"
        )
        ch["label"] = ch["categoria_entrada"] + " → " + ch["categoria_atual"]
        ch["mes_mudanca"] = ch["data_mudanca"].dt.strftime("%Y-%m")
        tl = (
            ch.groupby(["mes_mudanca", "label"], dropna=True)
            .size()
            .reset_index(name="quantidade")
        )
        tl.columns = ["periodo", "transicao", "quantidade"]
        age_changes_timeline = _to_records(tl.sort_values(["periodo", "quantidade"], ascending=[True, False]))

    return {
        "age_category_changes":  _to_records(grp),
        "age_cat_summary": {
            "total_entradas_analisadas": total,
            "total_mudaram_categoria":   total_mudou,
            "total_nao_mudaram":         len(unchanged),
            "pct_mudaram": round(total_mudou / total * 100, 1) if total > 0 else 0,
        },
        "por_categoria_entrada":  _to_records(por_entrada),
        "age_changes_timeline":   age_changes_timeline,
    }


def _safe(func):
    try:
        result = func()
        if result is None or (isinstance(result, float) and (np.isnan(result) or np.isinf(result))):
            return NA_MSG
        return result
    except Exception:
        return NA_MSG


def _to_records(df: pd.DataFrame) -> List[Dict]:
    raw = df.to_dict(orient="records")
    clean = []
    for row in raw:
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                clean_row[k] = None
            elif isinstance(v, (np.integer,)):
                clean_row[k] = int(v)
            elif isinstance(v, (np.floating,)):
                clean_row[k] = float(v) if not (math.isnan(v) or math.isinf(v)) else None
            elif isinstance(v, np.bool_):
                clean_row[k] = bool(v)
            else:
                clean_row[k] = v
        clean.append(clean_row)
    return clean


def _norm(s: str) -> str:
    return (
        unicodedata.normalize("NFKD", str(s))
        .encode("ascii", errors="ignore")
        .decode("ascii")
        .upper()
        .strip()
    )


def _detect_granularity(df: pd.DataFrame, start_date=None, end_date=None) -> tuple:
    """Returns (granularity, date_range_days, period_start, period_end)."""
    # Prefer data_pesagem for date range calculation
    date_col = "data_pesagem" if "data_pesagem" in df.columns else ("data" if "data" in df.columns else None)

    period_start = None
    period_end   = None

    if start_date and end_date:
        try:
            sd = pd.to_datetime(start_date)
            ed = pd.to_datetime(end_date)
            date_range = (ed - sd).days
            period_start = str(sd.date())
            period_end   = str(ed.date())
        except Exception:
            date_range = None
    elif date_col and date_col in df.columns:
        dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
        # Filter out bogus dates (epoch artifacts, bad serial conversions)
        dates = dates[dates.dt.year >= 2000]
        if len(dates) > 0:
            d_min = dates.min()
            d_max = dates.max()
            date_range = (d_max - d_min).days
            period_start = str(d_min.date())
            period_end   = str(d_max.date())
        else:
            date_range = None
    else:
        date_range = None

    if date_range is not None and date_range <= 40:
        granularity = "weekly"
    else:
        granularity = "monthly"

    return granularity, date_range, period_start, period_end


def get_chart_titles(granularity: str) -> Dict[str, str]:
    if granularity == "weekly":
        return {
            "movimentacao": "Evolução Semanal Acumulada do Rebanho",
            "ent_sai":      "Entradas × Saídas por Semana",
            "valor":        "Valor Movimentado por Semana",
            "periodo_key":  "semana_ano",
        }
    return {
        "movimentacao": "Evolução Mensal Acumulada do Rebanho",
        "ent_sai":      "Entradas × Saídas por Mês",
        "valor":        "Valor Movimentado por Mês",
        "periodo_key":  "mes_ano",
    }


def calculate_category_variation(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculates animal category transitions within the (already-filtered) period.
    Uses the 'id' column (brinco) as the individual animal identifier.
    Falls back to 'id_animal' if 'id' is absent.
    """
    CATEGORIAS_ORDER = [
        "Bezerro", "Garrote", "Novilha", "Boi", "Vaca", "Boi 37+", "Vaca 37+",
        "Categoria não identificada", "Fora da regra de classificação",
    ]

    # ── Determine ID column ──────────────────────────────────────────────────
    id_col = None
    if "id" in df.columns:
        id_col = "id"
    elif "id_animal" in df.columns:
        id_col = "id_animal"

    no_id_summary = {
        "total_ids_analisados":    0,
        "total_ids_com_mudanca":   0,
        "total_ids_sem_mudanca":   0,
        "total_registros_sem_id":  len(df),
        "maior_entrada_categoria": "",
        "maior_saida_categoria":   "",
        "maior_variacao_positiva": "",
        "maior_variacao_negativa": "",
        "identificacao_confiavel": False,
        "campo_identificacao":     id_col or "Não disponível",
        "aviso": (
            "Coluna ID não encontrada. Variação de categoria não calculada."
            if id_col is None
            else "Sem registros com Categoria_Calculada disponível."
        ),
    }

    if id_col is None or "categoria_calculada" not in df.columns:
        return {
            "category_variation":  [],
            "category_transitions": [],
            "summary":             no_id_summary,
        }

    # ── Date column for sorting ──────────────────────────────────────────────
    date_col = next(
        (c for c in ("data_pesagem", "data") if c in df.columns),
        None
    )

    # ── Remove records without ID ────────────────────────────────────────────
    null_id_vals = {"", "nan", "none", "NaN", "None", "NA", "na"}
    sem_id_mask = df[id_col].isna() | df[id_col].astype(str).str.strip().isin(null_id_vals)
    total_sem_id = int(sem_id_mask.sum())
    df_valid = df[~sem_id_mask].copy()

    if len(df_valid) == 0:
        no_id_summary["total_registros_sem_id"] = total_sem_id
        no_id_summary["aviso"] = "Todos os registros estão sem ID. Variação de categoria não calculada."
        return {
            "category_variation":  [],
            "category_transitions": [],
            "summary":             no_id_summary,
        }

    # ── Sort by ID and date ──────────────────────────────────────────────────
    sort_keys = [id_col] + ([date_col] if date_col else [])
    df_valid = df_valid.sort_values(sort_keys)

    # ── Compute first / last category per ID ────────────────────────────────
    transitions = []
    for animal_id, group in df_valid.groupby(id_col, sort=False):
        cat_inicial = str(group.iloc[0]["categoria_calculada"])
        cat_final   = str(group.iloc[-1]["categoria_calculada"])
        mudou       = (len(group) >= 2) and (cat_inicial != cat_final)

        def _date_str(row):
            if date_col and pd.notna(row[date_col]):
                v = row[date_col]
                if hasattr(v, "date"):
                    return str(v.date())
                return str(v)
            return None

        transitions.append({
            "id":               str(animal_id),
            "categoria_inicial": cat_inicial,
            "categoria_final":   cat_final,
            "data_inicial":      _date_str(group.iloc[0]),
            "data_final":        _date_str(group.iloc[-1]),
            "mudou_categoria":   mudou,
        })

    # ── Tally entradas / saídas per category ─────────────────────────────────
    var_map = {cat: {"entradas": 0, "saidas": 0} for cat in CATEGORIAS_ORDER}

    for t in transitions:
        if not t["mudou_categoria"]:
            continue
        ci = t["categoria_inicial"]
        cf = t["categoria_final"]
        if ci in var_map:
            var_map[ci]["saidas"]   += 1
        if cf in var_map:
            var_map[cf]["entradas"] += 1

    category_variation = []
    for cat in CATEGORIAS_ORDER:
        ent = var_map[cat]["entradas"]
        sai = var_map[cat]["saidas"]
        if ent > 0 or sai > 0:
            category_variation.append({
                "categoria":       cat,
                "entradas":        ent,
                "saidas":          sai,
                "variacao_liquida": ent - sai,
            })

    # ── Summary ───────────────────────────────────────────────────────────────
    total_ids       = len(transitions)
    ids_com_mudanca = sum(1 for t in transitions if t["mudou_categoria"])
    ids_sem_mudanca = total_ids - ids_com_mudanca

    def _best(lst, key, agg=max):
        items = [x for x in lst if x[key] > 0]
        return agg(items, key=lambda x: x[key])["categoria"] if items else ""

    maior_entrada   = _best(category_variation, "entradas")
    maior_saida     = _best(category_variation, "saidas")
    positivas       = [x for x in category_variation if x["variacao_liquida"] > 0]
    negativas       = [x for x in category_variation if x["variacao_liquida"] < 0]
    maior_positiva  = max(positivas,  key=lambda x:  x["variacao_liquida"])["categoria"] if positivas  else ""
    maior_negativa  = min(negativas,  key=lambda x:  x["variacao_liquida"])["categoria"] if negativas  else ""

    # Generate automatic analytical text
    if ids_com_mudanca > 0:
        texto = (
            f"Este gráfico mostra a variação de animais por categoria calculada, comparando a "
            f"primeira e a última categoria identificada para cada ID dentro do período selecionado. "
            f"Foram analisados {total_ids:,} IDs únicos: {ids_com_mudanca:,} mudaram de categoria "
            f"e {ids_sem_mudanca:,} permaneceram na mesma categoria."
        )
        if maior_entrada:
            texto += f" Maior entrada: {maior_entrada}."
        if maior_saida:
            texto += f" Maior saída: {maior_saida}."
        if maior_positiva:
            texto += f" Maior variação positiva: {maior_positiva}."
        if maior_negativa:
            texto += f" Maior variação negativa: {maior_negativa}."
        if total_sem_id > 0:
            texto += (
                f" ⚠️ {total_sem_id:,} registros sem ID foram excluídos desta análise."
            )
    elif total_ids > 0:
        texto = (
            f"Foram analisados {total_ids:,} IDs únicos. "
            "Nenhum animal mudou de categoria dentro do período selecionado. "
            "Isso pode indicar um período muito curto ou que os animais já estão em categorias estáveis."
        )
        if total_sem_id > 0:
            texto += f" ⚠️ {total_sem_id:,} registros sem ID foram excluídos."
    else:
        texto = (
            "Não foi possível calcular a variação de categoria. "
            "Verifique se o campo ID está preenchido e se há pelo menos dois registros por animal."
        )

    # ── Transition matrix: count per (inicial → final) pair ─────────────────
    matrix_counts: Dict = {}
    for t in transitions:
        if t["mudou_categoria"]:
            key = (t["categoria_inicial"], t["categoria_final"])
            matrix_counts[key] = matrix_counts.get(key, 0) + 1

    transition_matrix = sorted(
        [
            {
                "categoria_inicial": ci,
                "categoria_final":   cf,
                "quantidade":        cnt,
                "label":             f"{ci} → {cf}",
            }
            for (ci, cf), cnt in matrix_counts.items()
        ],
        key=lambda x: -x["quantidade"],
    )

    return {
        "category_variation":   category_variation,
        "category_transitions": transitions[:500],   # cap JSON size
        "transition_matrix":    transition_matrix,
        "summary": {
            "total_ids_analisados":    total_ids,
            "total_ids_com_mudanca":   ids_com_mudanca,
            "total_ids_sem_mudanca":   ids_sem_mudanca,
            "total_registros_sem_id":  total_sem_id,
            "maior_entrada_categoria": maior_entrada,
            "maior_saida_categoria":   maior_saida,
            "maior_variacao_positiva": maior_positiva,
            "maior_variacao_negativa": maior_negativa,
            "identificacao_confiavel": True,
            "campo_identificacao":     id_col,
            "texto_analitico":         texto,
        },
    }


def get_metric_definitions() -> Dict[str, Any]:
    return {
        "total_entradas": {
            "title": "Total de Entradas",
            "source": "Coluna 'Evento'",
            "formula": "Contagem de registros cujo Evento é classificado como entrada (Compra, Nascimento, Retorno…)",
            "meaning": "Total de animais que ingressaram no rebanho no período selecionado.",
            "caution": "Requer preenchimento correto do campo 'Evento'. Eventos não reconhecidos não são contados.",
            "columns": ["Evento"],
            "respects_filters": True,
        },
        "total_saidas": {
            "title": "Total de Saídas",
            "source": "Coluna 'Evento'",
            "formula": "Contagem de registros cujo Evento é classificado como saída (Venda, Morte, Abate…)",
            "meaning": "Total de animais que saíram do rebanho no período selecionado.",
            "caution": "Requer preenchimento correto do campo 'Evento'. Eventos não reconhecidos não são contados.",
            "columns": ["Evento"],
            "respects_filters": True,
        },
        "saldo_rebanho": {
            "title": "Saldo do Rebanho",
            "source": "Calculado",
            "formula": "Total de Entradas − Total de Saídas",
            "meaning": "Variação líquida do rebanho no período. Saldo positivo = crescimento.",
            "caution": "Saldo negativo indica mais saídas que entradas — revisar dados ou operação.",
            "columns": ["Evento"],
            "respects_filters": True,
        },
        "peso_total": {
            "title": "Peso Total",
            "source": "Coluna 'Peso'",
            "formula": "Σ Peso de todos os animais pesados no período",
            "meaning": "Massa total do rebanho com pesagem registrada.",
            "caution": "Inclui apenas animais com peso preenchido. Outliers podem distorcer o total.",
            "columns": ["Peso", "Data Pesagem"],
            "respects_filters": True,
        },
        "peso_medio": {
            "title": "Peso Médio por Cabeça",
            "source": "Calculado",
            "formula": "Peso Total ÷ Saldo do Rebanho",
            "meaning": "Estimativa de peso médio por animal com base no saldo atual.",
            "caution": "Baseado no saldo do rebanho; requer saldo positivo e dados de peso completos.",
            "columns": ["Peso", "Evento"],
            "respects_filters": True,
        },
        "valor_total": {
            "title": "Valor Total Movimentado",
            "source": "Coluna 'Valor'",
            "formula": "Σ Valor de todas as transações no período",
            "meaning": "Valor financeiro total movimentado no período.",
            "caution": "Inclui apenas registros com valor preenchido.",
            "columns": ["Valor"],
            "respects_filters": True,
        },
        "valor_medio_cabeca": {
            "title": "Valor Médio por Cabeça",
            "source": "Calculado",
            "formula": "Valor Total ÷ Total de Animais (registros)",
            "meaning": "Valor médio por cabeça no período.",
            "caution": "Pode incluir animais sem transação financeira registrada.",
            "columns": ["Valor"],
            "respects_filters": True,
        },
        "taxa_mortalidade": {
            "title": "Taxa de Mortalidade",
            "source": "Calculado",
            "formula": "Total de Mortes ÷ Total de Animais × 100",
            "meaning": "Percentual de animais mortos em relação ao total registrado.",
            "caution": "Benchmark pecuário aceitável: ≤ 3%. Acima disso, investigar causas com urgência.",
            "columns": ["Evento"],
            "respects_filters": True,
        },
        "total_pesagens": {
            "title": "Total de Pesagens",
            "source": "Coluna 'Data Pesagem'",
            "formula": "Contagem de registros com Data Pesagem preenchida",
            "meaning": "Quantidade de eventos de pesagem registrados no período.",
            "caution": "Registros sem Data Pesagem não são contados.",
            "columns": ["Data Pesagem"],
            "respects_filters": True,
        },
        "peso_max": {
            "title": "Peso Máximo",
            "source": "Coluna 'Peso'",
            "formula": "Máximo valor da coluna Peso",
            "meaning": "Maior peso individual registrado no período.",
            "caution": "Valores muito altos podem indicar erro de digitação (peso de lote vs. individual).",
            "columns": ["Peso"],
            "respects_filters": True,
        },
        "peso_min": {
            "title": "Peso Mínimo",
            "source": "Coluna 'Peso'",
            "formula": "Mínimo valor da coluna Peso (excluindo zeros)",
            "meaning": "Menor peso individual registrado no período.",
            "caution": "Valores muito baixos podem indicar erro de digitação.",
            "columns": ["Peso"],
            "respects_filters": True,
        },
        "evolucao_rebanho": {
            "title": "Evolução Acumulada do Rebanho",
            "source": "Calculado a partir de Entradas e Saídas por período",
            "formula": (
                "Para cada período (mês ou semana): Saldo do período = Entradas − Saídas. "
                "Saldo acumulado = soma cumulativa dos saldos de todos os períodos até o atual."
            ),
            "meaning": (
                "Mostra como o tamanho do rebanho evoluiu ao longo do tempo. "
                "Linha ascendente = crescimento do rebanho; descendente = redução."
            ),
            "caution": (
                "O valor acumulado parte de zero (início do período filtrado). "
                "Requer coluna Evento preenchida corretamente para classificação de Entrada/Saída."
            ),
            "columns": ["Evento", "Data Pesagem"],
            "respects_filters": True,
        },
        "variacao_por_categoria": {
            "title": "Variação de Animais por Categoria",
            "source": "BASE_TRATADA — campo ID, data de referência, Idade, Sexo e Categoria_Calculada",
            "formula": (
                "Para cada ID, compara a Categoria_Calculada do primeiro registro no período "
                "com a do último registro. "
                "Entrada = IDs cuja categoria final é a analisada e a inicial era diferente. "
                "Saída = IDs cuja categoria inicial é a analisada e a final era diferente. "
                "Variação líquida = entradas − saídas."
            ),
            "meaning": (
                "Mostra a transição dos animais entre categorias ao longo do período selecionado, "
                "causada pela evolução da idade. "
                "O campo ID representa o brinco/identificação individual do animal."
            ),
            "caution": (
                "O campo ID é obrigatório para esta análise. "
                "Registros sem ID não entram no cálculo. "
                "Animais com apenas um registro no período não geram transição."
            ),
            "columns": ["ID", "Data Pesagem", "Idade", "Sexo", "Categoria_Calculada"],
            "respects_filters": True,
        },
    }


def calculate_kpis(
    df: pd.DataFrame,
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
) -> Dict[str, Any]:
    kpis: Dict[str, Any] = {}

    # ── Granularity ──────────────────────────────────────────────────────────
    granularity, date_range_days, period_start, period_end = _detect_granularity(
        df, start_date, end_date
    )
    kpis["granularity"]      = granularity
    kpis["date_range_days"]  = date_range_days
    kpis["period_start"]     = period_start
    kpis["period_end"]       = period_end
    kpis["chart_titles"]     = get_chart_titles(granularity)
    kpis["metric_definitions"] = get_metric_definitions()

    # ── Column availability ───────────────────────────────────────────────────
    has_peso  = "peso" in df.columns and df["peso"].notna().sum() > 0
    has_valor = "valor" in df.columns and df["valor"].notna().sum() > 0
    has_tipo  = "tipo_movimentacao_norm" in df.columns or "tipo_movimentacao" in df.columns
    has_evento = "evento_norm" in df.columns or "evento" in df.columns

    tipo_col   = "tipo_movimentacao_norm" if "tipo_movimentacao_norm" in df.columns else "tipo_movimentacao"
    evento_col = "evento_norm" if "evento_norm" in df.columns else ("evento" if "evento" in df.columns else None)

    # ── Período para agrupamento temporal ────────────────────────────────────
    # Prefer data_pesagem for time grouping; fallback to data
    if "mes_pesagem" in df.columns and df["mes_pesagem"].notna().any():
        mensal_col = "mes_pesagem"
        semanal_col = "semana_ano" if "semana_ano" in df.columns else None
    elif "mes_ano" in df.columns:
        mensal_col = "mes_ano"
        semanal_col = None
    else:
        mensal_col = None
        semanal_col = None

    periodo_col = semanal_col if (granularity == "weekly" and semanal_col) else mensal_col

    # ── 1. Entradas ───────────────────────────────────────────────────────────
    if evento_col:
        ev = df[evento_col].astype(str)
        ent_mask = ev.apply(lambda x: bool(_ENTRADA_RE.search(_norm(x))))
        sai_mask = ev.apply(lambda x: bool(_SAIDA_RE.search(_norm(x))))
        kpis["total_entradas"] = int(ent_mask.sum())
        kpis["total_saidas"]   = int(sai_mask.sum())
    elif has_tipo:
        tc = df[tipo_col].astype(str)
        ent_mask = tc.str.upper().str.contains(r"ENTRADA|COMPRA|NASC", na=False, regex=True)
        sai_mask = tc.str.upper().str.contains(r"SAIDA|SA[IÍ]DA|VENDA|MORTE|ABATE", na=False, regex=True)
        kpis["total_entradas"] = int(ent_mask.sum())
        kpis["total_saidas"]   = int(sai_mask.sum())
    else:
        kpis["total_entradas"] = NA_MSG
        kpis["total_saidas"]   = NA_MSG

    # ── 2. Saldo ──────────────────────────────────────────────────────────────
    ent = kpis.get("total_entradas")
    sai = kpis.get("total_saidas")
    if isinstance(ent, (int, float)) and isinstance(sai, (int, float)):
        kpis["saldo_rebanho"] = int(ent - sai)
    else:
        kpis["saldo_rebanho"] = NA_MSG

    # ── 3. Peso ───────────────────────────────────────────────────────────────
    if has_peso:
        peso_sum = float(df["peso"].sum())
        kpis["peso_total"] = _safe(lambda: round(peso_sum, 2))
        saldo = kpis.get("saldo_rebanho")
        if isinstance(saldo, (int, float)) and saldo > 0:
            kpis["peso_medio"] = round(peso_sum / saldo, 2)
        else:
            kpis["peso_medio"] = NA_MSG
        kpis["peso_max"] = _safe(lambda: round(float(df["peso"].max()), 2))
        kpis["peso_min"] = _safe(lambda: round(float(df[df["peso"] > 0]["peso"].min()), 2))
    else:
        kpis["peso_total"] = NA_MSG
        kpis["peso_medio"] = NA_MSG
        kpis["peso_max"]   = NA_MSG
        kpis["peso_min"]   = NA_MSG

    # ── 4. Valor ──────────────────────────────────────────────────────────────
    if has_valor:
        kpis["valor_total"] = _safe(lambda: round(float(df["valor"].sum()), 2))
        tot = len(df)
        if tot > 0:
            kpis["valor_medio_cabeca"] = _safe(
                lambda: round(float(df["valor"].sum() / tot), 2)
            )
        else:
            kpis["valor_medio_cabeca"] = NA_MSG
    else:
        kpis["valor_total"]        = NA_MSG
        kpis["valor_medio_cabeca"] = NA_MSG

    # ── 5. Pesagens ───────────────────────────────────────────────────────────
    if "data_pesagem" in df.columns:
        pesagens_mask = df["data_pesagem"].notna()
        kpis["total_pesagens"] = int(pesagens_mask.sum())
    else:
        kpis["total_pesagens"] = NA_MSG

    # ── 6. Mortalidade ────────────────────────────────────────────────────────
    if evento_col:
        morte_mask = df[evento_col].astype(str).apply(
            lambda x: bool(_MORTE_RE.search(_norm(x)))
        )
        tot_mortes = int(morte_mask.sum())
    elif has_tipo:
        morte_mask = df[tipo_col].astype(str).str.upper().str.contains(
            r"MORTE|MORTALIDADE|MORTO|OBITO|BAIXA", na=False, regex=True
        )
        tot_mortes = int(morte_mask.sum())
    else:
        tot_mortes = None

    if tot_mortes is not None:
        kpis["total_mortalidade"] = tot_mortes
        tot = len(df)
        kpis["taxa_mortalidade"] = round(tot_mortes / tot * 100, 2) if tot > 0 else 0.0
    else:
        kpis["total_mortalidade"] = NA_MSG
        kpis["taxa_mortalidade"]  = NA_MSG

    # ── 7. Por fazenda ────────────────────────────────────────────────────────
    if "fazenda" in df.columns:
        g = df.groupby("fazenda", dropna=True).size().reset_index(name="quantidade")
        kpis["por_fazenda"] = _to_records(g.sort_values("quantidade", ascending=False))
    else:
        kpis["por_fazenda"] = []

    # ── 8. Por lote ───────────────────────────────────────────────────────────
    if "lote" in df.columns:
        g = df.groupby("lote", dropna=True).size().reset_index(name="quantidade")
        kpis["por_lote"] = _to_records(
            g.sort_values("quantidade", ascending=False).head(20)
        )
    else:
        kpis["por_lote"] = []

    # ── 9. Por categoria calculada ────────────────────────────────────────────
    if "categoria_calculada" in df.columns:
        g = df.groupby("categoria_calculada", dropna=True).size().reset_index(name="quantidade")
        g.columns = ["categoria", "quantidade"]
        kpis["por_categoria"] = _to_records(g.sort_values("quantidade", ascending=False))
    elif "categoria" in df.columns:
        g = df.groupby("categoria", dropna=True).size().reset_index(name="quantidade")
        g.columns = ["categoria", "quantidade"]
        kpis["por_categoria"] = _to_records(g.sort_values("quantidade", ascending=False))
    else:
        kpis["por_categoria"] = []

    # ── 10. Por tipo de movimentação ─────────────────────────────────────────
    if has_tipo:
        g = df.groupby(tipo_col, dropna=True).size().reset_index(name="quantidade")
        g.columns = ["tipo_movimentacao", "quantidade"]
        kpis["por_tipo_movimentacao"] = _to_records(g.sort_values("quantidade", ascending=False))
    else:
        kpis["por_tipo_movimentacao"] = []

    # ── 11. Por evento ────────────────────────────────────────────────────────
    if evento_col:
        # use original "evento" for display (not normalized)
        ev_display = "evento" if "evento" in df.columns else evento_col
        g = df.groupby(ev_display, dropna=True).size().reset_index(name="quantidade")
        g.columns = ["evento", "quantidade"]
        kpis["por_evento"] = _to_records(g.sort_values("quantidade", ascending=False))

        # Saídas por evento
        if "evento" in df.columns:
            df_sai = df[sai_mask].copy() if "sai_mask" in dir() else df.copy()
        else:
            df_sai = df
        ev_sai_col = "evento" if "evento" in df.columns else evento_col
        if evento_col and len(df) > 0:
            sai_ev = df[evento_col].astype(str)
            sai_ev_mask = sai_ev.apply(lambda x: bool(_SAIDA_RE.search(_norm(x))))
            df_saidas = df[sai_ev_mask]
            if len(df_saidas) > 0:
                ev_col_display = "evento" if "evento" in df_saidas.columns else evento_col
                g2 = df_saidas.groupby(ev_col_display, dropna=True).size().reset_index(name="quantidade")
                g2.columns = ["evento", "quantidade"]
                kpis["saidas_por_evento"] = _to_records(g2.sort_values("quantidade", ascending=False))
            else:
                kpis["saidas_por_evento"] = []
        else:
            kpis["saidas_por_evento"] = []
    else:
        kpis["por_evento"]       = []
        kpis["saidas_por_evento"] = []

    # ── 12. Peso médio por lote ───────────────────────────────────────────────
    if "lote" in df.columns and has_peso:
        g = df.groupby("lote", dropna=True)["peso"].mean().reset_index()
        g.columns = ["lote", "peso_medio"]
        g["peso_medio"] = g["peso_medio"].round(2)
        kpis["peso_medio_por_lote"] = _to_records(g.head(15))
    else:
        kpis["peso_medio_por_lote"] = []

    # ── 13. Valor por lote ────────────────────────────────────────────────────
    if "lote" in df.columns and has_valor:
        g = df.groupby("lote", dropna=True)["valor"].sum().reset_index()
        g.columns = ["lote", "valor_total"]
        g["valor_total"] = g["valor_total"].round(2)
        kpis["valor_por_lote"] = _to_records(
            g.sort_values("valor_total", ascending=False).head(15)
        )
    else:
        kpis["valor_por_lote"] = []

    # ── 14. Peso médio por categoria calculada ───────────────────────────────
    if "categoria_calculada" in df.columns and has_peso:
        g_mean  = df.groupby("categoria_calculada", dropna=True)["peso"].mean().reset_index()
        g_count = df.groupby("categoria_calculada", dropna=True)["peso"].count().reset_index()
        g_mean.columns  = ["categoria", "peso_medio"]
        g_count.columns = ["categoria", "quantidade"]
        g = g_mean.merge(g_count, on="categoria")
        g["peso_medio"] = g["peso_medio"].round(2)
        kpis["peso_medio_por_categoria"] = _to_records(g)
    else:
        kpis["peso_medio_por_categoria"] = []

    # ── 15. Peso médio por fazenda ────────────────────────────────────────────
    if "fazenda" in df.columns and has_peso:
        g = df.groupby("fazenda", dropna=True)["peso"].mean().reset_index()
        g.columns = ["fazenda", "peso_medio"]
        g["peso_medio"] = g["peso_medio"].round(2)
        kpis["peso_medio_por_fazenda"] = _to_records(g)
    else:
        kpis["peso_medio_por_fazenda"] = []

    # ── 16. Movimentação por período (granularity-aware) ──────────────────────
    if periodo_col and periodo_col in df.columns:
        g = df.groupby(periodo_col, dropna=True).size().reset_index(name="quantidade")
        g.columns = ["periodo", "quantidade"]
        kpis["movimentacao_mensal"] = _to_records(g.sort_values("periodo"))
    else:
        kpis["movimentacao_mensal"] = []

    # ── 17. Entradas × Saídas por período ────────────────────────────────────
    if periodo_col and periodo_col in df.columns and evento_col:
        ev = df[evento_col].astype(str)
        ent_m = ev.apply(lambda x: bool(_ENTRADA_RE.search(_norm(x))))
        sai_m = ev.apply(lambda x: bool(_SAIDA_RE.search(_norm(x))))

        g_ent = df[ent_m].groupby(periodo_col).size().reset_index(name="entrada")
        g_sai = df[sai_m].groupby(periodo_col).size().reset_index(name="saida")
        g = g_ent.merge(g_sai, on=periodo_col, how="outer").fillna(0)
        g["entrada"] = g["entrada"].astype(int)
        g["saida"]   = g["saida"].astype(int)
        g = g.rename(columns={periodo_col: "periodo"})
        kpis["ent_sai_mensal"] = _to_records(g.sort_values("periodo"))
    else:
        kpis["ent_sai_mensal"] = []

    # ── 17b. Evolução acumulada do rebanho ───────────────────────────────────
    if kpis.get("ent_sai_mensal"):
        acum = 0
        evolucao = []
        for row in sorted(kpis["ent_sai_mensal"], key=lambda x: x.get("periodo", "")):
            saldo = (row.get("entrada", 0) or 0) - (row.get("saida", 0) or 0)
            acum += saldo
            evolucao.append({
                "periodo":        row["periodo"],
                "entrada":        row.get("entrada", 0),
                "saida":          row.get("saida", 0),
                "saldo_periodo":  saldo,
                "saldo_acumulado": acum,
            })
        kpis["evolucao_acumulada"] = evolucao
    else:
        kpis["evolucao_acumulada"] = []

    # ── 18. Valor por período ─────────────────────────────────────────────────
    if periodo_col and periodo_col in df.columns and has_valor:
        g = df.groupby(periodo_col, dropna=True)["valor"].sum().reset_index()
        g.columns = ["periodo", "valor"]
        g["valor"] = g["valor"].round(2)
        kpis["valor_mensal"] = _to_records(g.sort_values("periodo"))
    else:
        kpis["valor_mensal"] = []

    # ── 19. Evolução de peso por período (entradas apenas) ───────────────────
    if periodo_col and periodo_col in df.columns and has_peso:
        if "tipo_movimentacao_norm" in df.columns:
            df_peso = df[~df["tipo_movimentacao_norm"].str.contains(_SAIDA_RE.pattern, na=False)]
        else:
            df_peso = df
        df_peso = df_peso[df_peso["peso"].notna()]
        if not df_peso.empty:
            # Overall average per period
            g_mean  = df_peso.groupby(periodo_col, dropna=True)["peso"].mean().reset_index()
            g_count = df_peso.groupby(periodo_col, dropna=True)["peso"].count().reset_index()
            g_mean.columns  = ["periodo", "peso_medio"]
            g_count.columns = ["periodo", "quantidade"]
            g = g_mean.merge(g_count, on="periodo")
            g["peso_medio"] = g["peso_medio"].round(2)
            kpis["peso_evolucao"] = _to_records(g.sort_values("periodo"))

            # Per event type (long format: periodo, evento, peso_medio, quantidade)
            ev_col = "evento" if "evento" in df_peso.columns else (
                     "evento_norm" if "evento_norm" in df_peso.columns else None)
            if ev_col:
                df_ev = df_peso[df_peso[ev_col].notna() & (df_peso[ev_col].astype(str).str.strip() != "")]
                if not df_ev.empty:
                    ge_mean  = df_ev.groupby([periodo_col, ev_col], dropna=True)["peso"].mean().reset_index()
                    ge_count = df_ev.groupby([periodo_col, ev_col], dropna=True)["peso"].count().reset_index()
                    ge_mean.columns  = ["periodo", "evento", "peso_medio"]
                    ge_count.columns = ["periodo", "evento", "quantidade"]
                    ge = ge_mean.merge(ge_count, on=["periodo", "evento"])
                    ge["peso_medio"] = ge["peso_medio"].round(2)
                    kpis["peso_evolucao_evento"] = _to_records(ge.sort_values(["periodo", "evento"]))
                else:
                    kpis["peso_evolucao_evento"] = []
            else:
                kpis["peso_evolucao_evento"] = []
        else:
            kpis["peso_evolucao"] = []
            kpis["peso_evolucao_evento"] = []
    else:
        kpis["peso_evolucao"] = []
        kpis["peso_evolucao_evento"] = []

    # ── 20. Variação de animais por categoria (transições por ID) ─────────────
    cat_var = calculate_category_variation(df)
    kpis["category_variation"]    = cat_var.get("category_variation", [])
    kpis["category_transitions"]  = cat_var.get("category_transitions", [])
    kpis["transition_matrix"]     = cat_var.get("transition_matrix", [])
    kpis["category_var_summary"]  = cat_var.get("summary", {})

    # ── 21. Mudança de categoria por idade (chegou vs. hoje) ──────────────────
    age_chg = calculate_category_change_by_age(df, reference_date=end_date)
    kpis["age_category_changes"]  = age_chg.get("age_category_changes", [])
    kpis["age_cat_summary"]       = age_chg.get("age_cat_summary", {})
    kpis["por_categoria_entrada"] = age_chg.get("por_categoria_entrada", [])
    kpis["age_changes_timeline"]  = age_chg.get("age_changes_timeline", [])

    return kpis


def generate_executive_comments(kpis: Dict[str, Any], df: pd.DataFrame) -> Dict[str, str]:
    comments: Dict[str, str] = {}
    granularity = kpis.get("granularity", "monthly")
    periodo_label = "semana" if granularity == "weekly" else "mês"

    # Principal movimentação
    mensal = kpis.get("movimentacao_mensal", [])
    if mensal:
        top = max(mensal, key=lambda x: x.get("quantidade") or 0)
        comments["principal_movimentacao"] = (
            f"O período com maior movimentação foi {top.get('periodo', 'N/D')}, "
            f"com {top.get('quantidade', 0):,} animais movimentados."
        )
    else:
        comments["principal_movimentacao"] = (
            "Dados insuficientes para identificar período de maior movimentação."
        )

    # Categoria mais relevante
    por_cat = kpis.get("por_categoria", [])
    if por_cat:
        top = por_cat[0]
        comments["categoria_relevante"] = (
            f"A categoria com maior representatividade é '{top.get('categoria', 'N/D')}', "
            f"com {top.get('quantidade', 0):,} animais ({len(por_cat)} categorias no total)."
        )
    else:
        comments["categoria_relevante"] = (
            "Dados insuficientes para identificar categoria mais relevante."
        )

    # Fazenda com maior concentração
    por_fazenda = kpis.get("por_fazenda", [])
    if por_fazenda:
        top = por_fazenda[0]
        comments["fazenda_concentracao"] = (
            f"A fazenda com maior concentração é '{top.get('fazenda', 'N/D')}', "
            f"com {top.get('quantidade', 0):,} animais."
        )
    else:
        comments["fazenda_concentracao"] = (
            "Dados insuficientes para identificar fazenda com maior concentração."
        )

    # Lote com maior movimentação
    por_lote = kpis.get("por_lote", [])
    if por_lote:
        top = por_lote[0]
        comments["lote_movimentacao"] = (
            f"O lote com maior movimentação é '{top.get('lote', 'N/D')}', "
            f"com {top.get('quantidade', 0):,} animais."
        )
    else:
        comments["lote_movimentacao"] = (
            "Dados insuficientes para identificar lote com maior movimentação."
        )

    # Saldo do rebanho
    saldo = kpis.get("saldo_rebanho")
    ent   = kpis.get("total_entradas")
    sai   = kpis.get("total_saidas")
    if isinstance(saldo, (int, float)):
        sinal = "positivo" if saldo >= 0 else "negativo"
        ent_s = f"{ent:,}" if isinstance(ent, (int, float)) else "N/D"
        sai_s = f"{sai:,}" if isinstance(sai, (int, float)) else "N/D"
        comments["saldo_rebanho"] = (
            f"Saldo do rebanho {sinal}: {saldo:+,} cabeças "
            f"({ent_s} entradas vs {sai_s} saídas)."
        )
    else:
        comments["saldo_rebanho"] = "Saldo do rebanho não calculado — campo Evento não encontrado."

    # Inconsistências
    comments["inconsistencias"] = (
        "Acesse a aba 'Validações' para detalhes completos sobre inconsistências encontradas nos dados."
    )

    # Riscos
    taxa = kpis.get("taxa_mortalidade")
    if isinstance(taxa, (int, float)) and taxa > 3:
        comments["riscos"] = (
            f"⚠️ ATENÇÃO: Taxa de mortalidade de {taxa}% acima do benchmark recomendado (3%). "
            "Investigar causas com urgência."
        )
    elif isinstance(taxa, (int, float)):
        comments["riscos"] = (
            f"Taxa de mortalidade em {taxa}% — dentro do limite aceitável (≤ 3%)."
        )
    else:
        comments["riscos"] = (
            "Nenhum risco crítico identificado automaticamente. "
            "Consulte a aba de Validações para análise completa."
        )

    # Pesagens
    total_p = kpis.get("total_pesagens")
    if isinstance(total_p, (int, float)):
        comments["pesagens"] = (
            f"{total_p:,} pesagens registradas no período. "
            f"Peso total: {kpis.get('peso_total', 'N/D')} kg. "
            f"Peso médio estimado: {kpis.get('peso_medio', 'N/D')} kg/cab."
        )

    # Recomendações
    comments["recomendacoes"] = (
        "Manter atualização periódica dos dados. "
        "Preencher campos obrigatórios: lote, evento, sexo e idade para categorização automática. "
        "Monitorar variações periódicas do rebanho e taxa de mortalidade. "
        "Realizar auditorias regulares para eliminar registros duplicados."
    )

    return comments
