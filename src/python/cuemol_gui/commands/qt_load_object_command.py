from pathlib import Path

from cuemol_gui.create_renderer_dialog import CreateRendererDialog
from cuemol_gui.history import update_molsel_history
from PySide2.QtWidgets import QDialog, QFileDialog

import cuemol
from cuemol.undo_txn import UndoTxn

from .gui_command_base import GUICommandBase
from .qt_load_scene_command import create_filter


class QtLoadObjectCommand(GUICommandBase):
    def get_name(self):
        return "qt_load_object"

    def run(self, widget, undo_txn):

        filters, type_names = create_filter("object_reader")

        # File open dialog
        filter_str = ";;".join(filters)
        dlg = QFileDialog(widget, "Open file", "", filter_str)
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

        print(f"selected: {file_path} {file_fmt}")

        # Determine target scene
        sc_mgr = cuemol.svc("SceneManager")
        active_scene_id = sc_mgr.activeSceneID
        # print(f"active_scene_id: {active_scene_id}")
        active_scene = None
        # targ_scene = None
        if active_scene_id > 0:
            active_scene = sc_mgr.getScene(active_scene_id)
            print(f"active_scene: {active_scene}")
        if not active_scene:
            # TODO: show msgbox
            return

        # Object Setup Dialog
        crdlg = CreateRendererDialog(active_scene_id, widget)
        crdlg.setup_by_file_format(file_fmt)
        crdlg.object_name = self.create_default_obj_name(file_path)
        if crdlg.exec() != QDialog.Accepted:
            return
        obj_name = crdlg.object_name

        with UndoTxn("load object", active_scene, undo_txn):
            # Emit load_object command
            cmd_mgr = cuemol.svc("CmdMgr")
            load_obj_cmd = cmd_mgr.getCmd("load_object")

            load_obj_cmd.target_scene = active_scene
            load_obj_cmd.file_path = file_path
            load_obj_cmd.object_name = obj_name
            load_obj_cmd.file_format = file_fmt

            load_obj_cmd.run()

            # set results
            self.result_object = load_obj_cmd.result_object

            # Create initial renderer
            new_rend_cmd = cmd_mgr.getCmd("new_renderer")
            new_rend_cmd.target_object = self.result_object
            new_rend_cmd.renderer_type = crdlg.rend_type_name
            new_rend_cmd.renderer_name = crdlg.renderer_name
            new_rend_cmd.recenter_view = crdlg.recenter_view
            # new_rend_cmd.default_style_name = "DefaultCPKColoring"

            new_rend_cmd.run()

            # Set default styles
            new_rend_cmd.result_renderer.applyStyles("DefaultCPKColoring")

            # Set selection
            sel = crdlg.mol_select
            if sel is not None:
                new_rend_cmd.result_renderer.sel = sel
                # save to history
                update_molsel_history(sel.toString())

        # set results
        self.result_renderer = new_rend_cmd.result_renderer

    @staticmethod
    def create_default_obj_name(file_path):
        return Path(file_path).stem
