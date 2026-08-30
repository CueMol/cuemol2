import React, { useEffect, useState } from 'react';
import { Radio, RadioGroup } from '@blueprintjs/core';
import { DialogShell } from './DialogShell';

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
  const [selected, setSelected] = useState<number | null>(objects[0]?.id ?? null);

  // The provider reuses one component instance across invocations -- re-seed
  // the default selection each time the dialog re-opens.
  useEffect(() => {
    if (visible) setSelected(objects[0]?.id ?? null);
  }, [visible, objects]);

  return (
    <DialogShell
      visible={visible}
      title="Save Object As"
      width="xl"
      onCancel={() => onResult(null)}
      onOk={() => onResult(selected)}
      okLabel={"Save As\u2026"}
      okDisabled={selected === null}
    >
      <RadioGroup
        label="Select an object to save:"
        selectedValue={selected ?? undefined}
        onChange={(e) => setSelected(Number((e.target as HTMLInputElement).value))}
      >
        {objects.map((o) => (
          <Radio key={o.id} label={o.name} value={o.id} />
        ))}
      </RadioGroup>
    </DialogShell>
  );
}
