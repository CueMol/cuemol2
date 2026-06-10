import React from "react";
import { AppIcon } from "./AppIcon";
import type { AppIconKey } from "../data/appIcons";

interface StatusBarProps {
  activeToolLabel?: string;
  activeToolShortcut?: string;
  activeToolIcon?: AppIconKey;
  busy?: boolean;
  statusMessage?: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  activeToolLabel,
  activeToolShortcut,
  activeToolIcon,
  busy,
  statusMessage,
}) => {
  return (
    <div className="status-bar">
      <div className="status-left">
        {statusMessage && (
          <span className="status-item">
            {statusMessage}
          </span>
        )}
      </div>
      <div className="status-center">
        {activeToolLabel && (
          <span className="status-item status-tool" title="Active viewport tool">
            {activeToolIcon && <AppIcon name={activeToolIcon} size="sm" aria-hidden />}
            <span>{activeToolLabel}</span>
            {activeToolShortcut && (
              <span className="status-tool-shortcut">({activeToolShortcut})</span>
            )}
          </span>
        )}
      </div>
      <div className="status-right">
        {busy ? (
          <span className="status-item status-busy" title="Worker is processing">
            <AppIcon name="ui.refresh" size={10} className="status-spinner" aria-hidden />
            Busy
          </span>
        ) : (
          <span className="status-item status-ok">
            <AppIcon name="ui.statusDot" size={8} aria-hidden />
            Ready
          </span>
        )}
      </div>
    </div>
  );
};
