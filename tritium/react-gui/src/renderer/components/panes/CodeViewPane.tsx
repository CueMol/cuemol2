/**
 * Tab content pane for "codeview" tabs.
 *
 * Renders a read-only, line-numbered view of text file content.
 */

import React from "react";

interface CodeViewPaneProps {
  content: string;
}

export const CodeViewPane: React.FC<CodeViewPaneProps> = ({ content }) => (
  <pre className="code-view">
    <code>
      {content.split("\n").map((line, i) => (
        <div key={i} className="code-line">
          <span className="line-number">{i + 1}</span>
          <span className="line-text">{line}</span>
        </div>
      ))}
    </code>
  </pre>
);
