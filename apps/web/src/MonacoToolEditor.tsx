import { useEffect, useRef, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { THEME_CHANGE_EVENT, THEMES, getThemeDefinition, monacoThemeName, type ThemeDefinition, type ThemeId } from "./themes";

// Use the bundled monaco-editor instead of loading it from the jsDelivr CDN at
// runtime, so the editor works offline and under a strict CSP. Python only needs
// the base editor worker.
if (typeof window !== "undefined") {
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  loader.config({ monaco });
}

const COMPLETION_PROVIDER_ID = "agnolab-python";

function buildMonacoTheme(theme: ThemeDefinition): monaco.editor.IStandaloneThemeData {
  const palette = theme.monaco;
  return {
    base: palette.base,
    inherit: true,
    rules: [
      { token: "comment", foreground: palette.comment, fontStyle: "italic" },
      { token: "keyword", foreground: palette.keyword },
      { token: "string", foreground: palette.string },
      { token: "number", foreground: palette.number },
      { token: "type.identifier", foreground: palette.type },
      { token: "delimiter", foreground: palette.delimiter },
      { token: "identifier", foreground: palette.foreground.replace("#", "") },
      { token: "operator", foreground: palette.operator },
    ],
    colors: {
      "editor.background": palette.background,
      "editor.foreground": palette.foreground,
      "editorLineNumber.foreground": palette.lineNumber,
      "editorLineNumber.activeForeground": palette.lineNumberActive,
      "editorCursor.foreground": palette.cursor,
      "editor.selectionBackground": palette.selection,
      "editor.inactiveSelectionBackground": palette.lineHighlight,
      "editor.lineHighlightBackground": palette.lineHighlight,
      "editor.findMatchHighlightBackground": palette.selection,
      "editorBracketMatch.background": palette.selection,
      "editorBracketMatch.border": palette.cursor,
      "focusBorder": theme.tokens.primary,
    },
  };
}

function currentThemeId(): ThemeId {
  return getThemeDefinition(document.documentElement.getAttribute("data-theme")).id;
}

/** Tracks the app theme so the editor re-themes live when the user switches. */
function useAppThemeId(): ThemeId {
  const [themeId, setThemeId] = useState<ThemeId>(() => currentThemeId());
  useEffect(() => {
    const handle = (event: Event) => setThemeId((event as CustomEvent<ThemeId>).detail);
    window.addEventListener(THEME_CHANGE_EVENT, handle);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handle);
  }, []);
  return themeId;
}

export interface MonacoToolEditorProps {
  value: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  language?: string;
}

export default function MonacoToolEditor({
  value,
  onChange,
  height = "70vh",
  readOnly = false,
  language = "python",
}: MonacoToolEditorProps) {
  const completionRegisteredRef = useRef(false);
  const monacoThemeId = monacoThemeName(useAppThemeId());

  function handleBeforeMount(monaco: Monaco) {
    for (const theme of THEMES) {
      monaco.editor.defineTheme(monacoThemeName(theme.id), buildMonacoTheme(theme));
    }

    if (!completionRegisteredRef.current) {
      monaco.languages.registerCompletionItemProvider("python", {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          return {
            suggestions: [
            {
              label: "@tool function",
              kind: monaco.languages.CompletionItemKind.Snippet,
              range,
              insertText: [
                "@tool",
                "def ${1:tool_name}(value: str) -> str:",
                '    """${2:Describe what the tool does.}"""',
                "    return value",
              ].join("\n"),
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Agno function tool snippet",
            },
            {
              label: "Agent",
              kind: monaco.languages.CompletionItemKind.Class,
              range,
              insertText: "Agent",
              detail: "Agno Agent",
            },
            {
              label: "Team",
              kind: monaco.languages.CompletionItemKind.Class,
              range,
              insertText: "Team",
              detail: "Agno Team",
            },
            {
              label: "OpenAIChat",
              kind: monaco.languages.CompletionItemKind.Class,
              range,
              insertText: 'OpenAIChat(id="${1:gpt-4.1-mini}")',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Agno OpenAI model",
            },
            {
              label: "return content",
              kind: monaco.languages.CompletionItemKind.Snippet,
              range,
              insertText: 'return f"${1:Result}: {value}"',
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: "Template response",
            },
            ],
          };
        },
      });
      completionRegisteredRef.current = true;
    }

    monaco.editor.setTheme(monacoThemeId);
  }

  function handleMount(monacoEditorInstance: unknown, monaco: Monaco) {
    void monacoEditorInstance;
    monaco.editor.setTheme(monacoThemeId);
  }

  return (
    <div className="monaco-shell" data-provider={COMPLETION_PROVIDER_ID}>
      <Editor
        height={height}
        defaultLanguage={language}
        language={language}
        value={value}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={onChange ? (nextValue) => onChange(nextValue ?? "") : undefined}
        theme={monacoThemeId}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          fontLigatures: true,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          wordWrap: "off",
          padding: { top: 16, bottom: 16 },
          readOnly,
          readOnlyMessage: { value: "" },
          renderLineHighlight: readOnly ? "all" : "line",
          lineNumbersMinChars: 3,
          overviewRulerLanes: 0,
          suggest: {
            showWords: true,
            showSnippets: true,
          },
        }}
      />
    </div>
  );
}
