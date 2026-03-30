import { useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";

const COMPLETION_PROVIDER_ID = "agnolab-python";

export interface MonacoToolEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MonacoToolEditor({ value, onChange }: MonacoToolEditorProps) {
  const completionRegisteredRef = useRef(false);

  function handleBeforeMount(monaco: Monaco) {
    monaco.editor.defineTheme("agnolab-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955" },
        { token: "keyword", foreground: "C586C0" },
        { token: "string", foreground: "CE9178" },
        { token: "number", foreground: "B5CEA8" },
      ],
      colors: {
        "editor.background": "#05080d",
        "editorLineNumber.foreground": "#5c6370",
        "editorLineNumber.activeForeground": "#d6a45b",
        "editorCursor.foreground": "#d6a45b",
        "editor.selectionBackground": "#264f78",
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

    monaco.editor.setTheme("agnolab-dark");
  }

  function handleMount(monacoEditorInstance: unknown, monaco: Monaco) {
    void monacoEditorInstance;
    monaco.editor.setTheme("agnolab-dark");
  }

  return (
    <div className="monaco-shell" data-provider={COMPLETION_PROVIDER_ID}>
      <Editor
        height="70vh"
        defaultLanguage="python"
        language="python"
        value={value}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        theme="agnolab-dark"
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          fontLigatures: true,
          roundedSelection: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
          suggest: {
            showWords: true,
            showSnippets: true,
          },
        }}
      />
    </div>
  );
}
