import React from "react";
import { AppIcon } from "./AppIcon";
import { useActiveToolDef } from '../contexts/ActiveToolContext';
import { useStatusMessage } from '../state/statusMessage';
import { useCueMolBusy } from '../hooks/useCueMolBusy';
import { useBusyCursor } from '../hooks/useBusyCursor';

export const StatusBar: React.FC = () => {
  // Everything shown here is read from its owner; App passes nothing in.
  const activeDef = useActiveToolDef();
  const statusMessage = useStatusMessage();
  const busy = useCueMolBusy();
  // The same flag drives a global wait cursor, so the busy state is visible
  // wherever the pointer is -- not only here.
  useBusyCursor(busy);
  const { label: activeToolLabel, shortcut: activeToolShortcut, icon: activeToolIcon } = activeDef;
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
