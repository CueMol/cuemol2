import cuemol

import wx

print "wc.veersion= "+wx.version()

print "scene ID = "+str(scene_id);
print "view ID = "+str(view_id);

scm = cuemol.getService("SceneManager");
scene = scm.getScene(scene_id);

print "scene.uid = "+str(scene.uid);

color = cuemol.createObj("Color");
color.setCode(0xFFFFFF);
scene.bgcolor = color;
