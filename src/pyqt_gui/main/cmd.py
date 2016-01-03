import sys
import cuemol

def load(filename, name=None, scene=None, format=None):

    scMgr = cuemol.getService("SceneManager")
    scene = scMgr.getScene(self._scid);

        scene.clearAllData()
        
        strMgr = cuemol.getService("StreamManager")
        reader = strMgr.createHandler("qsc_xml", 3)
        reader.setPath(fname)
        
        reader.attach(scene)
        reader.read()
        reader.detach()

        scene.loadViewFromCam(self._vwid, "__current")

