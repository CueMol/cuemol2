#
# Python base wrapper class
#

class BaseWrapper:

    def __init__(self, aWrapped):
        self._wrapped = aWrapped

    def __str__(self):
        return self.toString()

