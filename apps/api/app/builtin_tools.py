from __future__ import annotations

from importlib import import_module
import inspect
import json
from typing import Any


def parse_builtin_tool_config(config_raw: str | None) -> tuple[dict[str, Any], str | None]:
    normalized = str(config_raw or "").strip()
    if not normalized:
        return {}, None

    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
        return {}, f"Invalid built-in tool config JSON: {exc}"

    if not isinstance(parsed, dict):
        return {}, "Built-in tool config must be a JSON object."

    return parsed, None


def instantiate_builtin_tool(import_path: str, class_name: str, config_raw: str | None = None) -> tuple[Any | None, str | None]:
    if not import_path.strip() or not class_name.strip():
        return None, "Built-in tool import path and class name are required."

    config, config_error = parse_builtin_tool_config(config_raw)
    if config_error:
        return None, config_error

    try:
        module = import_module(import_path)
    except Exception as exc:
        return None, f"Failed to import {import_path}: {exc}"

    toolkit_class = getattr(module, class_name, None)
    if toolkit_class is None:
        return None, f"Built-in tool class not found: {class_name}"

    try:
        return toolkit_class(**config), None
    except Exception as exc:
        return None, f"Failed to initialize {class_name}: {exc}"


def inspect_builtin_tool_functions(import_path: str, class_name: str, config_raw: str | None = None) -> tuple[list[dict[str, Any]], str | None]:
    toolkit, error = instantiate_builtin_tool(import_path, class_name, config_raw)
    if error is not None or toolkit is None:
        return [], error

    functions = getattr(toolkit, "functions", None)
    if not isinstance(functions, dict) or not functions:
        return [], f"{class_name} does not expose any registered functions."

    options: list[dict[str, Any]] = []
    for function_name, function in functions.items():
        entrypoint = getattr(function, "entrypoint", None)
        if entrypoint is None:
            continue

        try:
            signature = inspect.signature(entrypoint)
        except (TypeError, ValueError):
            signature = None

        parameter_specs: list[dict[str, Any]] = []
        required_params: list[str] = []
        optional_params: list[str] = []
        signature_label = "()"

        if signature is not None:
            signature_label = str(signature)
            for parameter in signature.parameters.values():
                kind = parameter.kind.name.lower()
                has_default = parameter.default is not inspect._empty
                required = not has_default and kind not in {"var_positional", "var_keyword"}
                parameter_specs.append(
                    {
                        "name": parameter.name,
                        "kind": kind,
                        "required": required,
                        "has_default": has_default,
                        "default_value": None if not has_default else repr(parameter.default),
                    }
                )
                if required:
                    required_params.append(parameter.name)
                elif kind not in {"var_positional", "var_keyword"}:
                    optional_params.append(parameter.name)

        description = str(getattr(function, "description", "") or "").strip() or None
        options.append(
            {
                "name": str(function_name),
                "label": f"{function_name}{signature_label}",
                "description": description,
                "signature": signature_label,
                "required_params": required_params,
                "optional_params": optional_params,
                "parameters": parameter_specs,
            }
        )

    if not options:
        return [], f"{class_name} does not expose any callable workflow functions."

    return options, None
