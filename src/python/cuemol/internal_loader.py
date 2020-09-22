import importlib

_internal_module = None


def import_internal():
    global _internal_module
    if _internal_module is not None:
        return _internal_module

    # try module version
    if _internal_module is None:
        mod_name = "cuemol._cuemol_internal"
        try:
            _internal_module = importlib.import_module(mod_name)
        except ModuleNotFoundError:
            pass

    # try embedded version
    if _internal_module is None:
        mod_name = "_cuemol_internal"
        _internal_module = importlib.import_module(mod_name)

    return _internal_module
