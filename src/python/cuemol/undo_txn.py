import cuemol


class UndoTxn:
    def __init__(self, aMsg=None, aScene=None, enable=True):
        self._enable = enable
        if aScene is None:
            self._scene = cuemol.scene()
        else:
            self._scene = aScene

        if aMsg is None:
            self.msg = ""
        else:
            self.msg = aMsg

    def __enter__(self):
        if not self._enable:
            return self
        self._scene.startUndoTxn(self.msg)
        return self

    def __exit__(self, exception_type, exception_value, traceback):
        if not self._enable:
            return self

        #        print('__exit__')
        if exception_value is None:
            self._scene.commitUndoTxn()
        else:
            self._scene.rollbackUndoTxn()
            print("  exception_type:", exception_type)
            print("  exception_value:", exception_value)
            print("  traceback:", traceback)


def txn(aScene, aMsg, aFunc):
    # EDIT TXN START
    aScene.startUndoTxn(aMsg)
    try:
        aFunc()
    except Exception:
        aScene.rollbackUndoTxn()
        return False
    aScene.commitUndoTxn()
    # EDIT TXN END
    return True
