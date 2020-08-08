import copy


class GUICommandBase(object):
    def __init__(self):
        pass

    def run(self, widget):
        raise NotImplementedError()

    def get_name(self):
        raise NotImplementedError()
        

class GUICommandManager(object):
    def __init__(self):
        self._data = {}

    def register(self, cmd):
        name = cmd.get_name()
        self._data[name] = cmd

    def unregister(self, name):
        del self._data[name]

    def get_command(self, name):
        return self._data[name]

    def run_command(self, name, widget):
        cmd = copy.deepcopy(self._data[name])
        cmd.run(widget)
        return cmd
    
    @classmethod
    def get_instance(cls):
        if not hasattr(cls, "_instance"):
            cls._instance = cls()
        return cls._instance