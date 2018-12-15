#
# Python base wrapper class
#

import cuemol_internal as ci
import cuemol as cm


class BaseWrapper:

    def __init__(self, aWrapped):
        self._wrapped = aWrapped

    def __str__(self):
        return self.toString()
