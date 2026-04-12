import React from "react";
import { Icon } from "@blueprintjs/core";

interface StatusBarProps {
  activeFile?: string;
  atomCount: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ activeFile, atomCount }) => {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item status-branch">
          <Icon icon="git-branch" size={12} />
          main
        </span>
        <span className="status-item">
          <Icon icon="film" size={12} />
          Scene1
        </span>
        <span className="status-item">
          <Icon icon="symbol-circle" size={12} />
          3 objects
        </span>
      </div>
      <div className="status-center">
        {activeFile && (
          <span className="status-item">
            <Icon icon="document" size={12} />
            {activeFile}
          </span>
        )}
      </div>
      <div className="status-right">
        <span className="status-item">Atoms: {atomCount}</span>
        <span className="status-item">OpenGL 4.6</span>
        <span className="status-item status-ok">
          <Icon icon="full-circle" size={8} />
          Ready
        </span>
      </div>
    </div>
  );
};
