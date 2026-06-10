/**
 * @file components/inspector/InspectorResetAllButton.tsx
 * @description Icon-only "Reset all to default" button placed next to the
 * Properties/Generic mode switcher in the inspector mode bar.
 *
 * Stateless and presentational -- the parent owns the reset handler. Shown only
 * for the Properties tab and disabled when nothing is modified. Exercised in the
 * component catalog (CatalogPane3) alongside a mock mode bar for design review.
 */

import React from "react";
import { Button, Tooltip } from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";

export interface InspectorResetAllButtonProps {
    /** Whether any property is modified (enables the button). */
    canResetAll: boolean;
    /** Reset every modified property on the inspected node (one undo step). */
    onResetAll: () => void;
}

export const InspectorResetAllButton: React.FC<InspectorResetAllButtonProps> = ({
    canResetAll,
    onResetAll,
}) => (
    <Tooltip content="Reset all to default" placement="bottom" compact>
        <Button
            className="inspector-reset-all"
            minimal
            small
            icon={<AppIcon name="ui.undo" aria-hidden />}
            aria-label="Reset all to default"
            disabled={!canResetAll}
            onClick={onResetAll}
        />
    </Tooltip>
);
