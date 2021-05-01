import json
import re

from PySide2.QtWidgets import QDialog, QFileDialog

import cuemol

from .gui_command_base import GUICommandBase
from .gui_command_manager import GUICommandManager


def create_filter(category_name):
    str_mgr = cuemol.svc("StreamManager")
    info = json.loads(str_mgr.getInfoJSON2())

    if category_name == "scene_reader":
        cat_id = str_mgr.SCENE_READER
    elif category_name == "object_reader":
        cat_id = str_mgr.OBJECT_READER
    elif category_name == "scene_writer":
        cat_id = str_mgr.SCENE_WRITER
    elif category_name == "object_writer":
        cat_id = str_mgr.OBJECT_WRITER
    else:
        raise ValueError(f"Unknown category name: {category_name}")

    filters = []
    type_names = []
    for elem in info:
        if elem["category"] != cat_id:
            continue
        # TODO: candidate

        # TODO: QDF type handling

        descr = elem["descr"]
        fext = elem["fext"]
        m = re.search(r"(\w+[\w\s]+\w+)\s+\(", descr)
        if m is None:
            # print(f"re not matched: {descr}")
            continue
        sub_descr = m.groups()[0]
        ext_list = fext.split("; ")
        ext_fmt = " ".join(ext_list)

        filters.append(f"{sub_descr} ({ext_fmt})")
        type_names.append(elem["name"])
    return filters, type_names


class QtLoadSceneCommand(GUICommandBase):
    def get_name(self):
        return "qt_load_scene"

    def run(self, widget, undo_txn):
        filters, type_names = create_filter("scene_reader")
        filter_str = ";;".join(filters)
        dlg = QFileDialog(widget, "Open scene file", "", filter_str)
        if dlg.exec() != QDialog.Accepted:
            return

        sel_files = dlg.selectedFiles()
        sel_filter = dlg.selectedNameFilter()

        # TODO: handle multiple files??
        file_path = sel_files[0]

        # find selected file type name
        file_fmt = None
        for f, t in zip(filters, type_names):
            if f == sel_filter:
                file_fmt = t
                break
        assert file_fmt is not None

        sc_mgr = cuemol.svc("SceneManager")
        cmd_mgr = cuemol.svc("CmdMgr")

        actsc_id = sc_mgr.activeSceneID
        print(f"actsc_id: {actsc_id}")
        act_sc = None
        targ_scene = None
        if actsc_id > 0:
            act_sc = sc_mgr.getScene(actsc_id)
            print(f"act_sc: {act_sc}")
        if act_sc and act_sc.isJustCreated():
            targ_scene = act_sc
        else:
            # Create new scene/view
            mgr = GUICommandManager.get_instance()
            result = mgr.run_command("qt_new_scene", widget)
            targ_scene = result.result_scene

        load_scene_cmd = cmd_mgr.getCmd("load_scene")
        load_scene_cmd.file_path = file_path
        # load_scene_cmd.scene_name =
        load_scene_cmd.file_format = file_fmt
        load_scene_cmd.target_scene = targ_scene
        load_scene_cmd.set_camera = True

        load_scene_cmd.run()

        # set results
        self.result_scene = load_scene_cmd.result_scene

        # update widgets (required??)
        widget.update()
        p = widget.active_mol_widget()
        if p:
            p.update()
