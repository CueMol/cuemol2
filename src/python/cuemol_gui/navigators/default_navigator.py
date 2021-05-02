from cuemol import logging

from .base_navigator import BaseNavigator

logger = logging.get_logger(__name__)


class DefaultNavigator(BaseNavigator):
    def __init__(self):
        pass

    def mouse_lbtn_clicked(self, x: int, y: int, mod, hit_res):
        if hit_res is None:
            return

        msg = (
            f"Molecule [{hit_res['obj_name']}],"
            + f" {hit_res['message']}, "
            + f"O: {hit_res['occ']} B: {hit_res['bfac']} "
            + f"Pos: ({hit_res['x']}, {hit_res['y']}, {hit_res['z']})"
        )
        logger.info(msg)

    def mouse_rbtn_clicked(self, x: int, y: int, mod, hit_res):
        pass
