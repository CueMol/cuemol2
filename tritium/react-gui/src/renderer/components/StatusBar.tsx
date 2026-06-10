import React from "react";
import { Icon } from "@blueprintjs/core";
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
            <Icon icon="refresh" size={10} className="status-spinner" />
            Busy
          </span>
        ) : (
          <span className="status-item status-ok">
            <Icon icon="full-circle" size={8} />
            Ready
          </span>
        )}
      </div>
    </div>
  );
};
