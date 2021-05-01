from .base_navigator import BaseNavigator


class DefaultNavigator(BaseNavigator):
    def __init__(self):
        pass

    def mouse_clicked(x: int, y: int, mod: int, hit_res):
        msg = (
            f"Molecule [{res['obj_name']}],"
            + f" {res['message']}, "
            + f"O: {res['occ']} B: {res['bfac']} "
            + f"Pos: ({res['x']}, {res['y']}, {res['z']})"
        )
        print(msg)
