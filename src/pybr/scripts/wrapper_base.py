#
# Python base wrapper class
#

import _cuemol_internal as ci

class WrapperBase:

    def __init__(self, aWrapped):
        self._wrapped = aWrapped

    def __str__(self):
        clsnm = ci.getClassName(self._wrapped)
        res = "<CueMol {} wrapper {}>".format(clsnm, self.toString())
        return res

    def __repr__(self):
        clsnm = ci.getClassName(self._wrapped)
        res = "<CueMol {} wrapper {}>".format(clsnm, self.toString())
        return res

