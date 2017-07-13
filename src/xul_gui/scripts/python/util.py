#
#  Generic utility functions
#

import cuemol

class UndoTxn:

    def __init__(self, aMsg=None, aScene=None):
#        print('__init__')

        if aScene==None:
            self.scene = cuemol.scene()
        else:
            self.scene = aScene

        if aMsg==None:
            self.msg = ""
        else:
            self.msg = aMsg


#    def __del__(self):
#        print('__del__')

    def __enter__(self):
#        print('__enter__')
        self.scene.startUndoTxn(self.msg)
        #raise ValueError # [LABEL C]
        return self

    def __exit__(self, exception_type, exception_value, traceback):
#        print('__exit__')
        if exception_value==None:
            self.scene.commitUndoTxn()
        else:
            self.scene.rollbackUndoTxn()
            print('  exception_type:', exception_type)
            print('  exception_value:', exception_value)
            print('  traceback:', traceback)


def txn(aScene, aMsg, aFunc):
    ## EDIT TXN START
    aScene.startUndoTxn(aMsg)
    try:
        aFunc()
#    except Exception, e:
#        print e, 'error occurred'
#        aScene.rollbackUndoTxn()
#        return False
    except:
        aScene.rollbackUndoTxn()
        return False
    aScene.commitUndoTxn()
    ## EDIT TXN END
    return True



