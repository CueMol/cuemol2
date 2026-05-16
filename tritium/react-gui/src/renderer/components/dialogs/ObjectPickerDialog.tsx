import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogBody, DialogFooter, Radio, RadioGroup } from '@blueprintjs/core';
import { useTheme } from '../../contexts/ThemeContext';

export interface ObjectPickerEntry {
  id: number;
  name: string;
}

interface Props {
  visible: boolean;
  objects: ObjectPickerEntry[];
  onResult: (objId: number | null) => void;
}

/**
 * Lets the user pick which scene object to save when File > Save File As is
 * invoked without a right-clicked node. Shown only when the active scene has
 * two or more objects.
 */
export function ObjectPickerDialog({ visible, objects, onResult }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [selected, setSelected] = useState<number | null>(objects[0]?.id ?? null);

  // The provider reuses one component instance across invocations -- re-seed
  // the default selection each time the dialog re-opens.
  useEffect(() => {
    if (visible) setSelected(objects[0]?.id ?? null);
  }, [visible, objects]);

  return (
    <Dialog
      isOpen={visible}
      onClose={() => onResult(null)}
      title="Save Object As"
      style={{ width: 400, paddingBottom: 0 }}
      portalClassName={isDark ? 'bp5-dark' : ''}
    >
      <DialogBody>
        <RadioGroup
          label="Select an object to save:"
          selectedValue={selected ?? undefined}
          onChange={(e) => setSelected(Number((e.target as HTMLInputElement).value))}
        >
          {objects.map((o) => (
            <Radio key={o.id} label={o.name} value={o.id} />
          ))}
        </RadioGroup>
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button onClick={() => onResult(null)}>Cancel</Button>
            <Button
              intent="primary"
              disabled={selected === null}
              onClick={() => onResult(selected)}
            >
              Save As&hellip;
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
