import type { StarterToolTemplate } from "./types";

export const STARTER_TOOLS: StarterToolTemplate[] = [
  {
    id: "starter_excel_workbook",
    name: "Excel Workbook Tool",
    description: "Reads .xls and .xlsx files, shows a preview, and computes sums for numeric columns.",
    functionName: "read_excel_workbook",
    prerequisite: "pip install pandas openpyxl xlrd",
    functionCode: `def read_excel_workbook(file_path: str, sheet_name: str | None = None, preview_rows: int = 10) -> str:
    """Read .xls or .xlsx files and return a JSON summary with numeric totals.

    Pass flow_input_file_path when the file comes from the canvas input node.
    """
    import json
    import os
    import re
    import warnings
    from zipfile import BadZipFile

    import pandas as pd

    def normalize_text(value: object) -> str:
        return str(value).strip().lower()

    def coerce_numeric(series: pd.Series) -> pd.Series:
        if pd.api.types.is_numeric_dtype(series):
            return pd.to_numeric(series, errors="coerce")

        def parse_value(value: object) -> object:
            if value is None or (isinstance(value, float) and pd.isna(value)):
                return None

            text = str(value).strip()
            if not text:
                return None

            text = text.replace("\\u00a0", " ")
            text = re.sub(r"[^0-9,.-]", "", text)
            if not text or text in {"-", ".", ",", "-.", "-,"}:
                return None

            if "," in text and "." in text:
                if text.rfind(",") > text.rfind("."):
                    text = text.replace(".", "").replace(",", ".")
                else:
                    text = text.replace(",", "")
            elif "," in text:
                text = text.replace(",", ".")

            try:
                return float(text)
            except ValueError:
                return None

        return pd.to_numeric(series.map(parse_value), errors="coerce")

    def build_stats(series: pd.Series) -> dict[str, float | int]:
        numeric = coerce_numeric(series).dropna()
        if numeric.empty:
            return {}

        return {
            "count": int(numeric.count()),
            "sum": round(float(numeric.sum()), 2),
            "mean": round(float(numeric.mean()), 2),
            "min": round(float(numeric.min()), 2),
            "max": round(float(numeric.max()), 2),
        }

    if not file_path:
        raise ValueError("Provide a file_path. If the file comes from the canvas input, use flow_input_file_path.")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    suffix = os.path.splitext(file_path)[1].lower()
    engine = "xlrd" if suffix == ".xls" else "openpyxl"

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Workbook contains no default style, apply openpyxl's default",
                category=UserWarning,
            )
            if sheet_name:
                sheets = {sheet_name: pd.read_excel(file_path, sheet_name=sheet_name, engine=engine)}
            else:
                sheets = pd.read_excel(file_path, sheet_name=None, engine=engine)
    except BadZipFile as error:
        raise ValueError(
            "The uploaded .xlsx file could not be opened. Re-upload the file and make sure it is a real Excel workbook, not a renamed CSV or corrupted archive."
        ) from error

    financial_keywords = (
        "valor",
        "total",
        "economia",
        "preco",
        "preço",
        "custo",
        "saldo",
        "tarifa",
        "amount",
        "price",
        "cost",
    )

    result = {
        "file_path": file_path,
        "sheet_count": len(sheets),
        "sheets": {},
    }

    for current_sheet, dataframe in sheets.items():
        preview = dataframe.head(preview_rows).where(dataframe.notna(), None)
        numeric_summary = {}
        financial_summary = {}

        for column in dataframe.columns.tolist():
            stats = build_stats(dataframe[column])
            if not stats:
                continue

            column_name = str(column)
            numeric_summary[column_name] = stats

            normalized_column = normalize_text(column_name)
            if any(keyword in normalized_column for keyword in financial_keywords):
                financial_summary[column_name] = stats

        result["sheets"][str(current_sheet)] = {
            "rows": int(dataframe.shape[0]),
            "columns": [str(column) for column in dataframe.columns.tolist()],
            "preview": preview.to_dict(orient="records"),
            "numeric_summary": numeric_summary,
            "financial_summary": financial_summary,
        }

    return json.dumps(result, ensure_ascii=False, indent=2)`,
  },
];
