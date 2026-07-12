// Post-processing of run stdout and generated-code preview. Extracted from App.tsx.

export function extractAgentResponse(stdout: string): string {
  const filteredLines = stdout
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("[debug]") && !line.startsWith("DEBUG"));

  const compacted: string[] = [];
  for (const line of filteredLines) {
    const isBlank = line.trim() === "";
    const previousIsBlank = compacted.length > 0 && compacted[compacted.length - 1].trim() === "";
    if (isBlank && previousIsBlank) {
      continue;
    }
    compacted.push(line);
  }

  let cleaned = compacted.join("\n").trim();
  cleaned = cleaned.replace(/<additional_information>[\s\S]*?<\/additional_information>/gi, "").trim();
  cleaned = cleaned.replace(
    /Runtime input context available to this flow:[\s\S]*?(?=(You have the capability to retain memories|$))/i,
    "",
  ).trim();
  cleaned = cleaned.replace(/You have the capability to retain memories[\s\S]*$/i, "").trim();
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

export function sanitizeGeneratedCode(code: string): string {
  return code
    .replace(
      /(_input_file_base64\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview; injected only at runtime>'",
    )
    .replace(
      /('password'\s*:\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*password\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*secret\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    )
    .replace(
      /(_agnolab_[a-z_]*token\s*=\s*)'[^']*'/g,
      "$1'<omitted from code preview>'",
    );
}
