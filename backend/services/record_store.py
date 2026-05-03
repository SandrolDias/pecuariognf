"""
record_store.py
Singleton mutable in-memory store for BASE_TRATADA.
Supports corrections with full audit log (LOG_CORRECOES).
"""
import math
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Optional

from services.data_cleaner import _compute_categoria_calculada


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_python(v):
    """Convert numpy/pandas types to plain Python types for JSON serialisation."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, np.bool_):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return v.strftime("%d/%m/%Y") if pd.notna(v) else None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return v


# ── Singleton store ────────────────────────────────────────────────────────────

class RecordStore:
    def __init__(self):
        self._df: Optional[pd.DataFrame] = None
        self._correction_log: List[Dict] = []
        # Track which registro_ids have been corrected (for UI status)
        self._corrected_ids: set = set()

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def initialize(self, df: pd.DataFrame) -> None:
        """Initialise (or re-initialise) the store with a fresh BASE_TRATADA."""
        self._df = df.copy()
        self._correction_log = []
        self._corrected_ids = set()

    def reset(self) -> None:
        """Clear the store (call on file upload)."""
        self._df = None
        self._correction_log = []
        self._corrected_ids = set()

    def is_initialized(self) -> bool:
        return self._df is not None

    # ── Read ───────────────────────────────────────────────────────────────────

    def get_df(self) -> Optional[pd.DataFrame]:
        """Return a copy of the current (possibly corrected) BASE_TRATADA."""
        return self._df.copy() if self._df is not None else None

    def get_record(self, registro_id: str) -> Optional[Dict]:
        """Return a single record as a plain dict, or None if not found."""
        if self._df is None:
            return None
        mask = self._df["registro_id"] == registro_id
        if not mask.any():
            return None
        row = self._df[mask].iloc[0]
        return self._row_to_dict(row)

    # ── Write ──────────────────────────────────────────────────────────────────

    def update_record(self, registro_id: str, updates: Dict[str, Any]) -> Optional[Dict]:
        """
        Apply field updates to a record.
        Returns the updated record dict, or None if registro_id not found.
        Recalculates Categoria_Calculada automatically if idade or sexo changes.
        Logs every changed field to LOG_CORRECOES.
        """
        if self._df is None:
            return None
        mask = self._df["registro_id"] == registro_id
        if not mask.any():
            return None

        idx = self._df[mask].index[0]
        now = datetime.now().isoformat()

        for campo, novo_valor in updates.items():
            # Protect system fields
            if campo in ("registro_id", "excel_row_number", "aba_origem",
                         "categoria_calculada", "sexo_norm", "evento_norm"):
                continue

            valor_anterior = (
                self._df.at[idx, campo]
                if campo in self._df.columns
                else None
            )
            valor_anterior = _to_python(valor_anterior)

            # Write new value
            self._df.at[idx, campo] = novo_valor

            # Determine ID / Brinco for the log entry
            _id_col = next((c for c in ("id", "id_animal") if c in self._df.columns), None)
            id_brinco = (
                str(self._df.at[idx, _id_col])
                if _id_col and pd.notna(self._df.at[idx, _id_col])
                else ""
            )
            excel_row = (
                int(self._df.at[idx, "excel_row_number"])
                if "excel_row_number" in self._df.columns
                else ""
            )

            self._correction_log.append({
                "timestamp": now,
                "registro_id": registro_id,
                "id_brinco": id_brinco,
                "excel_row_number": excel_row,
                "campo": campo,
                "valor_anterior": "" if valor_anterior is None else str(valor_anterior),
                "valor_novo": "" if novo_valor is None else str(novo_valor),
                "status": "Corrigido",
            })

        # ── Auto-recalculate Categoria_Calculada if age or sex changed ─────────
        if any(k in updates for k in ("idade", "sexo")):
            idade = self._df.at[idx, "idade"] if "idade" in self._df.columns else None

            # Update sexo_norm if sexo was changed
            if "sexo" in updates:
                novo_sexo = str(updates["sexo"]).strip()
                self._df.at[idx, "sexo_norm"] = novo_sexo
                sexo_norm = novo_sexo
            else:
                sexo_norm = (
                    str(self._df.at[idx, "sexo_norm"])
                    if "sexo_norm" in self._df.columns
                    else ""
                )

            nova_cat = _compute_categoria_calculada(idade, sexo_norm)
            self._df.at[idx, "categoria_calculada"] = nova_cat

        self._corrected_ids.add(registro_id)
        return self._row_to_dict(self._df.loc[idx])

    # ── Correction log ─────────────────────────────────────────────────────────

    def get_correction_log(self) -> List[Dict]:
        return list(self._correction_log)

    def has_corrections(self) -> bool:
        return len(self._correction_log) > 0

    def is_corrected(self, registro_id: str) -> bool:
        return registro_id in self._corrected_ids

    # ── Internal ───────────────────────────────────────────────────────────────

    def _row_to_dict(self, row) -> Dict:
        return {k: _to_python(v) for k, v in row.items()}


# ── Module-level singleton ────────────────────────────────────────────────────
_store = RecordStore()


def get_store() -> RecordStore:
    """Return the module-level singleton RecordStore."""
    return _store
