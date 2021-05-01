import cuemol
from cuemol_gui.gui_command_manager import GUICommandBase


class QtNewSceneCommand(GUICommandBase):
    def get_name(self):
        return "qt_new_scene"
    
    def run(self, widget, undo_txn):
        mgr = cuemol.svc("CmdMgr")
        new_scene_cmd = mgr.getCmd("new_scene")
        new_scene_cmd.create_view = True
        new_scene_cmd.activate = True

        new_scene_cmd.run()

        sce = new_scene_cmd.result_scene
        viw = new_scene_cmd.result_view
        print(f"new scene:{sce}")
        print(f"new view:{viw}")

        mol_widget = widget.create_mol_widget(sce.getUID(), viw.getUID())
        mol_widget.showMaximized()
        mol_widget.setWindowTitle(sce.name)
        
        # set results
        self.result_scene = sce
        self.result_view = viw
