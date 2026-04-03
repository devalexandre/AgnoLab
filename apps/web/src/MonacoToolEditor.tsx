import { useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";

const COMPLETION_PROVIDER_ID = "agnolab-python";
const MONACO_THEME_ID = "agnolab-agno-dark";

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

  function handleBeforeMount(monaco: Monaco) {
    monaco.editor.defineTheme(MONACO_THEME_ID, {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "777170", fontStyle: "italic" },
        { token: "keyword", foreground: "FF8D75" },
        { token: "string", foreground: "FFB19D" },
        { token: "number", foreground: "FF6A45" },
        { token: "type.identifier", foreground: "F5EFEE" },
        { token: "delimiter", foreground: "D5CFCE" },
        { token: "identifier", foreground: "F5EFEE" },
        { token: "operator", foreground: "FF562F" },
      ],
      colors: {
        "editor.background": "#111113",
        "editor.foreground": "#F5EFEE",
        "editorWhitespace.foreground": "#463F3F",
        "editorIndentGuide.background1": "#2D2726",
        "editorIndentGuide.activeBackground1": "#575150",
        "editorLineNumber.foreground": "#777170",
        "editorLineNumber.activeForeground": "#D5CFCE",
        "editorCursor.foreground": "#FF4017",
        "editor.selectionBackground": "#3A201A",
        "editor.inactiveSelectionBackground": "#281714",
        "editor.lineHighlightBackground": "#1E1817",
        "editor.findMatchBackground": "#5C2C1E",
        "editor.findMatchHighlightBackground": "#3A201A",
        "editorBracketMatch.background": "#3A201A",
        "editorBracketMatch.border": "#FF8D75",
        "focusBorder": "#FF4017",
      },
    });

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

    monaco.editor.setTheme(MONACO_THEME_ID);
  }

  function handleMount(monacoEditorInstance: unknown, monaco: Monaco) {
    void monacoEditorInstance;
    monaco.editor.setTheme(MONACO_THEME_ID);
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
        theme={MONACO_THEME_ID}
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
