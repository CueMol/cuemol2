import re
import json
import cuemol
from cuemol_gui.gui_command_manager import GUICommandBase, GUICommandManager
from PySide2.QtWidgets import QFileDialog, QDialog

class QtLoadObjectCommand(GUICommandBase):
    def get_name(self):
        return "qt_load_object"

    def run(self, widget):

        filters, type_names = create_filter("object_reader")

        sc_mgr = cuemol.svc("SceneManager")
        active_scene_id = sc_mgr.activeSceneID
        # print(f"active_scene_id: {active_scene_id}")
        active_scene = None
        targ_scene = None
        if active_scene_id > 0:
            active_scene = sc_mgr.getScene(active_scene_id)
            print(f"active_scene: {active_scene}")
        if not active_scene:
            # TODO: show msgbox
            return
        
