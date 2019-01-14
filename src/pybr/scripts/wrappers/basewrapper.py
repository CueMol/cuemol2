#
# Python base wrapper class
#

import cuemol._internal as ci

class BaseWrapper:

    def __init__(self, aWrapped):
        self._wrapped = aWrapped

    def __str__(self):
        clsnm = ci.getClassName(self._wrapped)
        res = "<CueMol {} wrapper {}>".format(clsnm, self.toString())
        return res

