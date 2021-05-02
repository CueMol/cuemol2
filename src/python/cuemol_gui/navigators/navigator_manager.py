import json

from cuemol_gui.event_manager import EventManager

import cuemol
from cuemol import logging

from .default_navigator import DefaultNavigator

logger = logging.get_logger(__name__)


def conv_modifier(mod: int):
    result = dict()
    emgr = EventManager.get_instance()
    result["shift"] = mod & emgr.INDEV_SHIFT != 0
    result["ctrl"] = mod & emgr.INDEV_CTRL != 0
    result["alt"] = mod & emgr.INDEV_ALT != 0
    result["lbtn"] = mod & emgr.INDEV_LBTN != 0
    result["mbtn"] = mod & emgr.INDEV_MBTN != 0
    result["rbtn"] = mod & emgr.INDEV_RBTN != 0
    logger.info(f"modifier: {result}")
    return result


class NavigatorManager(object):
    def __init__(self):
        self._data = {}
        self._active_view_id = None
        self._default_navi = DefaultNavigator()

    def register(self, navi):
        name = navi.get_name()
        self._data[name] = navi

    def unregister(self, name: str) -> None:
        del self._data[name]

    def get_navi(self, name: str):
        return self._data[name]

    def active_view_changed(self, view_id: int):
        self._active_view_id = view_id

    def active_view_clicked(self, x: int, y: int, mod: int):
        view = cuemol.sceMgr().getView(self._active_view_id)
        logger.info(f"on_molview_clicked x, y:{x}, {y}, mod: {mod}")
        if view is None:
            logger.info("on_molview_clicked: view is None")
            return
        sres = view.hitTest(x, y)
        hit_res = None
        # self.append_log(sres)
        try:
            logger.info(f"Hittest result: {sres}")
            hit_res = json.loads(sres)
        except json.JSONDecodeError as e:
            # TODO: error handling??
            logger.info(f"invalid hittest result: {e}")

        dmod = conv_modifier(mod)
        if dmod["lbtn"]:
            self._default_navi.mouse_lbtn_clicked(x, y, dmod, hit_res)
        elif dmod["rbtn"]:
            self._default_navi.mouse_rbtn_clicked(x, y, dmod, hit_res)
