from cuemol import logging

from PySide2.QtWidgets import QMenu, QAction
from PySide2.QtCore import QPoint
from .base_navigator import BaseNavigator

logger = logging.get_logger(__name__)


class DefaultNavigator(BaseNavigator):
    def __init__(self):
        pass

    def mouse_lbtn_clicked(self, x: int, y: int, mod, hit_res, widget):
        if hit_res is None:
            return

        msg = (
            f"Molecule [{hit_res['obj_name']}],"
            + f" {hit_res['message']}, "
            + f"O: {hit_res['occ']} B: {hit_res['bfac']} "
            + f"Pos: ({hit_res['x']}, {hit_res['y']}, {hit_res['z']})"
        )
        logger.info(msg)

    def mouse_rbtn_clicked(self, x: int, y: int, mod, hit_res, widget):
        menu = QMenu(widget)
        loc = QPoint(x, y)
        loc = widget.mapToGlobal(loc)
        logger.info(f"menu: {menu}")
        logger.info(f"loc: {loc}")
        menu.addAction(QAction("xxx", widget))
        menu.popup(loc)
