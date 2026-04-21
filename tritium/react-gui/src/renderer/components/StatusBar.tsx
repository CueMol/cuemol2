import React from "react";
import { Icon } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";

interface StatusBarProps {
  activeFile?: string;
  atomCount: string;
  activeToolLabel?: string;
  activeToolShortcut?: string;
  activeToolIcon?: IconName;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeFile,
  atomCount,
  activeToolLabel,
  activeToolShortcut,
  activeToolIcon,
}) => {
  return (
    <div className="status-bar">
      <div className="status-left">
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
        {activeToolLabel && (
          <span className="status-item status-tool" title="Active viewport tool">
            {activeToolIcon && <Icon icon={activeToolIcon} size={12} />}
            <span>{activeToolLabel}</span>
            {activeToolShortcut && (
              <span className="status-tool-shortcut">({activeToolShortcut})</span>
            )}
          </span>
        )}
        {activeFile && (
          <span className="status-item">
            <Icon icon="document" size={12} />
            {activeFile}
          </span>
        )}
      </div>
      <div className="status-right">
        <span className="status-item">Atoms: {atomCount}</span>
        <span className="status-item status-ok">
          <Icon icon="full-circle" size={8} />
          Ready
        </span>
      </div>
    </div>
  );
};
