import copy


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

    def run_command(self, name, widget, undo_txn=True):
        if name not in self._data:
            raise KeyError(f"{name} not found in command names")
        cmd = copy.deepcopy(self._data[name])
        cmd.run(widget, undo_txn)
        return cmd

    @classmethod
    def get_instance(cls):
        if not hasattr(cls, "_instance"):
            cls._instance = cls()
        return cls._instance
