from PySide2.QtCore import QSettings

from cuemol import logging

logger = logging.get_logger(__name__)


def get_molsel_history():
    qset = QSettings()
    qset.beginGroup("molsel_history")
    val = qset.value("value")
    if val is None:
        strlist = []
    else:
        strlist = val
    qset.endGroup()

    logger.info(f"get_molsel_history: {strlist}")
    return strlist


def update_molsel_history(newval):
    strlist = get_molsel_history()
    strlist.insert(0, newval)
    strlist = strlist[:10]
    logger.info(f"update_molsel_history: {strlist}")

    qset = QSettings()
    qset.beginGroup("molsel_history")
    qset.setValue("value", strlist)
    qset.endGroup()
