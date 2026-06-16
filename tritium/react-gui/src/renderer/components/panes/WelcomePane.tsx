/**
 * Tab content pane shown when no file is open in the editor.
 *
 * Displays the CueMol2 branding and a list of keyboard shortcuts to
 * help the user get started. This component is stateless and receives
 * no props -- it renders the same content every time.
 */

import React from "react";
import { Tag } from "@blueprintjs/core";

export const WelcomePane: React.FC = () => (
  <div className="editor-placeholder">
    <div className="placeholder-icon">⬡</div>
    <div className="placeholder-title">CueMol2</div>
    <div className="placeholder-subtitle">Molecular Visualization System</div>
    <div className="shortcut-group">
      <div className="shortcut-item">
        <Tag minimal className="shortcut-key">
          Ctrl+O
        </Tag>
        <span>Open File</span>
      </div>
      <div className="shortcut-item">
        <Tag minimal className="shortcut-key">
          Ctrl+N
        </Tag>
        <span>New Scene</span>
      </div>
      <div className="shortcut-item">
        <Tag minimal className="shortcut-key">
          Ctrl+R
        </Tag>
        <span>Run Script</span>
      </div>
      <div className="shortcut-item">
        <Tag minimal className="shortcut-key">
          Ctrl+T
        </Tag>
        <span>New Tab</span>
      </div>
    </div>
  </div>
);
