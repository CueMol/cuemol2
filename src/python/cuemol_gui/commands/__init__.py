from .gui_command_manager import GUICommandManager
from .qt_load_object_command import QtLoadObjectCommand 
from .qt_load_scene_command import QtLoadSceneCommand  
from .qt_new_scene_command import QtNewSceneCommand  


def load_commands():
    mgr = GUICommandManager.get_instance()
    mgr.register(QtNewSceneCommand())
    mgr.register(QtLoadSceneCommand())
    mgr.register(QtLoadObjectCommand())
