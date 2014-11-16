#!/usr/bin/env python

import cuemol_thrift as cuemol

import wx
import os

cuemol.init(9090, "xxx")

def test2():
    scm = cuemol.getService("SceneManager")
    scid = scm.activeSceneID;
    print "Active scene ID=", scid;
    if (scid==0):
        print "No active scene!!"
        return
    sc = scm.getScene(scid);
    vwid = sc.activeViewID;
    print "Active view ID=", vwid;
    if (vwid==0):
        print "No active scene!!"
        return

    color = cuemol.createObj("Color");
    color.setCode(0xFFFFFF);
    sc.bgcolor = color;
        
def readPDB(fname):
  mol = cuemol.createObj("MolCoord")
    
  for line in open(fname):
    # print "PDB: ", line;
    if line[0:6] in ["ATOM  ", "HETATM"]:
      aname = line[12:16].strip(  )
      altloc = line[16:17]
      resn = line[17:20].strip(  )
      chn = line[21:22]
      resid = int( line[22:26] )
      ins = line[26:27]
      posx = float( line[30:38] )
      posy = float( line[38:46] )
      posz = float( line[46:54] )
      occ = float( line[54:60] )
      bfac = float( line[60:66] )
      elem = line[76:78].strip()
    else:        
      print "PDB skip: ", line
      continue

    # print "name=", aname
    atom = cuemol.createObj("MolAtom");
    atom.name = aname;
    atom.element = elem;
    atom.bfac = bfac;
    atom.occ = occ;
    
    vpos = cuemol.createObj("Vector");
    vpos.set3(posx, posy, posz);
    atom.pos = vpos;
    
    mol.appendAtom1(atom, chn, resid, resn);

  return mol

def test_readpdb1():
  fname = '/net3/ishitani/PLP.pdb'
  mol = readPDB(fname)
  mol.name = "test"

  scm = cuemol.getService("SceneManager")
  scid = scm.activeSceneID;
  print "Active scene ID=", scid;
  if (scid==0):
    print "No active scene!!"
    return
  sc = scm.getScene(scid);

  # Register to the scene
  sc.addObject(mol)
        

class MyFrame(wx.Frame):
  def __init__(self, parent, title):
    wx.Frame.__init__(self, parent, title=title, size=(400,300))
    file_menu= wx.Menu()
    menuOpen = file_menu.Append(wx.ID_OPEN, "Open", "Open file")
    file_menu.AppendSeparator()
    menuExit = file_menu.Append(wx.ID_EXIT, "Exit", "Exit app")

    menuBar = wx.MenuBar()
    menuBar.Append(file_menu,"File (&F)")
    self.SetMenuBar(menuBar) 

    self.Bind(wx.EVT_MENU, self.OnOpen, menuOpen)
    self.Bind(wx.EVT_MENU, self.OnExit, menuExit)

    self.Show(True)

  def OnExit(self,e):
    self.Close(True)

  def OnOpen(self,e):
    dlg = wx.FileDialog(self, "Select file", "", "", "*.pdb", wx.OPEN)
    if dlg.ShowModal() == wx.ID_OK:
      filename = dlg.GetFilename()
      dirname = dlg.GetDirectory()
      fname = os.path.join(dirname, filename)

      mol = readPDB(fname)
      mol.name = filename

      scm = cuemol.getService("SceneManager")
      scid = scm.activeSceneID;
      print "Active scene ID=", scid;
      if (scid==0):
        print "No active scene!!"
        return
      sc = scm.getScene(scid);

      # Register to the scene
      sc.addObject(mol)

def test_readpdb2():
  application = wx.App()
  frame = MyFrame(None, "App")
  frame.Show()
  application.MainLoop()

def test1():
  obj = cuemol.createObj("Vector")
  print "v.x =  ", obj.x
  obj.x = 123.456
  print "v.x =  ", obj.x
  
  obj.set4(1,2,3,4);
  print "toString() =  ", obj.toString();

#for i in range (0,10000):
#  test1()

#except AuthException, io:
#  print 'AuthException: %r' % io

#except Thrift.TException, tx:
#  print '%s' % (tx.message)

#test2()

test_readpdb2()

