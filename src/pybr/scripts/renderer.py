"""
Renderer related utility
"""

import cuemol_internal as ci
from . import util as cm


def setupDefaultRenderer(obj):
    """
    Setup default renderer for object loaded by CUI's load() function
    """

    rend = None

    try:
        scene = obj.getScene()
        
        ## EDIT TXN START ##
        scene.startUndoTxn("Create default renderer")
        try:
            rend = obj.createRenderer("simple")
            rend.applyStyles("DefaultCPKColoring")
            rend.name = "simple1"
            rend.sel = cm.sel("*")
            print("active view ID="+str(scene.activeViewID))
            view = cm.view(scene)
            if view is None:
                print("setupDefault renderer: view is null, cannot recenter")
            else:
                pos = rend.getCenter()
                view.setViewCenter(pos)
        except:
            print("setupDefaultRenderer error")
            msg = traceback.format_exc()
            print(msg)
            scene.rollbackUndoTxn()
            return None
        else:
            scene.commitUndoTxn()
            ## EDIT TXN END ##
    except:
        print("setupDefaultRenderer error")
        msg = traceback.format_exc()
        print(msg)

    return rend

