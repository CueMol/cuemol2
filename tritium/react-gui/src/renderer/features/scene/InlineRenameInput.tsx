import React, { useState, useCallback } from "react";
import { InputGroup } from "@blueprintjs/core";

/**
 * Inline rename text input embedded inside a Blueprint Tree row label.
 *
 *   - Enter / blur with a non-empty edit -> commit
 *   - Escape -> cancel (label is restored)
 *   - clicks inside the input do NOT toggle the parent tree row
 *     (stopPropagation in mousedown/click)
 *
 * Kept as a module-level component so the rendered label has stable
 * identity between renders -- Blueprint Tree compares label props
 * shallowly when deciding whether to reapply selection styles.
 */
export const InlineRenameInput: React.FC<{
    inputRef: React.MutableRefObject<HTMLInputElement | null>;
    defaultValue: string;
    onCommit: (value: string) => void;
    onCancel: () => void;
}> = ({ inputRef, defaultValue, onCommit, onCancel }) => {
    const [value, setValue] = useState(defaultValue);
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onCommit(value);
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            } else if (e.key === "Backspace" || e.key === "Delete") {
                // Editing keys belong to the input. The scene tree binds these
                // to "delete the selected node" on an ancestor, so let the
                // default text edit happen but keep the event out of the tree.
                e.stopPropagation();
            }
        },
        [value, onCommit, onCancel],
    );
    return (
        <InputGroup
            inputRef={(el) => { inputRef.current = el; }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onCommit(value)}
            // Prevent Blueprint Tree's row click from stealing focus / toggling
            // selection while the user types inside the editor.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            small
            autoComplete="off"
            style={{ display: "inline-flex", minWidth: 120 }}
        />
    );
};
