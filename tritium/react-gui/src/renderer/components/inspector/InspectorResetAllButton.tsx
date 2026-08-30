/**
 * @file components/inspector/InspectorResetAllButton.tsx
 * @description Icon-only "Reset all to default" button placed next to the
 * Properties/Generic mode switcher in the inspector mode bar.
 *
 * The confirm step lives inside the button (UXP parity: the property dialogs'
 * shared `resetAllToDefault` asks "Reset all to default?" before the bulk
 * reset), so every call site -- InspectorPanel and AnimElementInspector --
 * gets the same guarded behavior. The parent still owns the reset handler,
 * which runs only after the Alert is confirmed. Disabled when nothing is
 * modified. Exercised in the component catalog (CatalogPane3) alongside a
 * mock mode bar for design review.
 */

import React, { useState } from "react";
import { Alert, Button, Tooltip } from "@blueprintjs/core";
import { useTheme } from "../../contexts/ThemeContext";
import { AppIcon } from "@renderer/h3-kit/primitives";

export interface InspectorResetAllButtonProps {
    /** Whether any property is modified (enables the button). */
    canResetAll: boolean;
    /** Reset every modified property on the inspected node (one undo step). */
    onResetAll: () => void;
}

export const InspectorResetAllButton: React.FC<InspectorResetAllButtonProps> = ({
    canResetAll,
    onResetAll,
}) => {
    const { theme } = useTheme();
    const [confirming, setConfirming] = useState(false);

    return (
        <>
            <Tooltip content="Reset all to default" placement="bottom" compact>
                <Button
                    className="inspector-reset-all"
                    minimal
                    small
                    icon={<AppIcon name="ui.resetDefaults" aria-hidden />}
                    aria-label="Reset all to default"
                    disabled={!canResetAll}
                    onClick={() => setConfirming(true)}
                />
            </Tooltip>
            {/* The icon-only button is easy to hit by accident and the reset
                touches every modified property at once, so ask first (UXP
                parity). The reset itself stays a single undo step. */}
            <Alert
                isOpen={confirming}
                intent="primary"
                confirmButtonText="Reset"
                cancelButtonText="Cancel"
                className={theme === "dark" ? "bp5-dark" : undefined}
                onCancel={() => setConfirming(false)}
                onConfirm={() => {
                    setConfirming(false);
                    onResetAll();
                }}
            >
                <p>Reset all properties to default?</p>
            </Alert>
        </>
    );
};
