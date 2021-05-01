class GUICommandBase(object):
    def __init__(self):
        pass

    def run(self, widget, undo_txn):
        raise NotImplementedError()

    def get_name(self):
        raise NotImplementedError()
