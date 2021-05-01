import json

from cuemol_gui.history import get_molsel_history
from PySide2.QtWidgets import QComboBox

import cuemol


class MolSelectBox(QComboBox):
    def __init__(self, scene_id=None, obj_id=None, parent=None):
        super().__init__(parent)
        self._scene_id = scene_id
        self._obj_id = obj_id
        self._sel = None
        self.setEditable(True)
        self.build_box()

        # Event handling
        self.currentTextChanged.connect(self.content_changed)

    @property
    def scene_id(self):
        return self._scene_id

    @property
    def selection(self):
        return self._sel

    def build_box_history(self):
        histlist = get_molsel_history()
        for s in histlist:
            if s != "*" and s != "none" and s != "":
                self.addItem(s, s)
        self.insertSeparator(self.count())

    def build_box(self):
        self.clear()

        initselval = None

        # Append the original selection
        print(f"MolSel.buildBox> orig sel: <{self._sel}>")
        if self._sel is not None:
            origsel_str = self._sel.toString()
            # if (!hislist.find(function (elem) {
            #   return elem == origsel_str;
            # })) {
            #   this.appendMenuItem(element, this.mOrigSel.toString(), this.mOrigSel.toString());
            #   this.appendSeparator(element);
            # }

            self.addItem(origsel_str, origsel_str)
            self.insertSeparator(self.count())
            # set self._sel as the initial selection
            if initselval is not None:
                initselval = origsel_str

        sce_id = None
        # Append the Object's current selection
        if self._obj_id is not None:
            obj = cuemol.getObject(self._obj_id)
            sce_id = obj.scene_uid
            # Update scene ID to object's parent scene
            if self._scene_id is None:
                self._scene_id = sce_id
            if hasattr("sel", obj):
                selstr = obj.sel.toString()
                if selstr.length != "":
                    self.addItem(f"current ({selstr})", selstr)
                if initselval is None:
                    initselval = selstr
        elif self._scene_id is not None:
            sce_id = self._scene_id

        self.addItem("all (*)", "*")
        self.addItem("none", "")
        self.insertSeparator(self.count())
        if initselval is None:
            initselval = ""  # init value is not set --> set as "none"

        # History
        self.build_box_history()

        # Scene's selection defs
        stylem = cuemol.getService("StyleManager")
        if sce_id is not None:
            json_str = stylem.getStrDataDefsJSON("sel", sce_id)
            print(f"scene selection defs: {json_str}")
            if self.append_sel_json(json_str) != 0:
                # prev_sep.setAttribute("label", "Scene")
                self.insertSeparator(self.count())

        # global selection defs
        json_str = stylem.getStrDataDefsJSON("sel", 0)
        print(f"global selection defs: {json_str}")
        if self.append_sel_json(json_str) != 0:
            pass
            # prev_sep.setAttribute("label", "Global")

        self.setMaxVisibleItems(20)

    def append_sel_json(self, json_str):
        seldefs = json.loads(json_str)
        for em in seldefs:
            self.addItem(em, em)
        return len(seldefs)

    def content_changed(self, text):
        selstr = self.currentText()
        print(f"content_changed: {selstr}")
        try:
            sel = cuemol.sel(selstr, self._scene_id)
        except ValueError as e:
            print(f"compile {selstr} failed. {e}")
            self._sel = None
            return

        self._sel = sel
