#
# Python base wrapper class
#

from cuemol.internal_loader import import_internal

ci = import_internal()


class WrapperBase:
    def __init__(self, aWrapped):
        self._wrapped = aWrapped

    def __str__(self):
        clsnm = ci.getClassName(self._wrapped)
        if hasattr(self, "toString"):
            res = f"<CueMol {clsnm} wrapper {self.toString()}>"
        else:
            res = f"<CueMol {clsnm} wrapper>"
        return res

    def __repr__(self):
        clsnm = ci.getClassName(self._wrapped)
        if hasattr(self, "toString"):
            res = f"<CueMol {clsnm} wrapper {self.toString()}>"
        else:
            res = f"<CueMol {clsnm} wrapper>"
        return res
