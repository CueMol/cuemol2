import tempfile
import os
import re
from pathlib import Path
import urllib.request

import cuemol._internal as ci
import cuemol as cm
# import cuemol.fileio as fileio
import cuemol.renderer as renderer

def load_url(aURL):

    rdr_type = "pdb"
    cmp_type = None

    if re.search("\.pdb\.gz$", aURL) or re.search("\.ent\.gz$", aURL):
        rdr_type = "pdb"
        cmp_type = "gzip"
    elif re.search("\.pdb$", aURL) or re.search("\.ent$", aURL):
        rdr_type = "pdb"
        cmp_type = None
    elif re.search("\.cif\.gz$", aURL):
        rdr_type = "mmcif"
        cmp_type = "gzip"
    elif re.search("\.cif$", aURL):
        rdr_type = "mmcif"
        cmp_type = None

    print("XXX",re.search("\.cif\.gz$", aURL))
    print("rdr_type", rdr_type)
    print("cmp_type", cmp_type)

    sm = cm.strMgr()

    reader = sm.createHandler(rdr_type, 0);
    if cmp_type:
        reader.compress = cmp_type

    tid = sm.loadObjectAsync(reader);

    # tmpobj = reader.createDefaultObj()
    # obj_type = tmpobj._wrapped.getClassName()
    # rend_types = tmpobj.searchCompatibleRendererNames();
    # tmpobj = None

    nchunksz = 65536

    with urllib.request.urlopen(aURL) as response:
        while True:
            chunk = response.read(nchunksz)
            if chunk:
                print("read:", type(chunk))
                b = cm.createWrapper( ci.createBAryFromBytes(chunk) )
                sm.supplyDataAsync(tid, b, len(chunk));
            else:
                break 

    res = sm.waitLoadAsync(tid);
    print("res",res)
    return res
    #return cm.createWrapper(res)
    
def fetch(pdbid, scene=None):
    sc = cm.scene(scene)
    url_tmpl = "http://files.rcsb.org/download/{}.cif.gz"
    obj = load_url(url_tmpl.format(pdbid.lower()))

    obj.name = pdbid
    sc.addObject(obj)

    print("obj.scene:", obj.getScene())
    renderer.setupDefaultRenderer(obj)

    return obj

