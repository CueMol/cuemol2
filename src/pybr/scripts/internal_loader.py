import importlib


def import_internal():
    mod_name = "cuemol._cuemol_internal"
    m = importlib.import_module(mod_name) 
    return m

