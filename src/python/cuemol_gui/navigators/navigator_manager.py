import json
import cuemol

from .default_navigator import DefaultNavigator


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
        print(f"on_molview_clicked x, y:{x}, {y}, mod: {mod}")
        if view is None:
            print("on_molview_clicked: view is None")
            return
        sres = view.hitTest(x, y)
        hit_res = None
        # self.append_log(sres)
        try:
            print(f"Hittest result: {sres}")
            hit_res = json.loads(sres)
        except json.JSONDecodeError as e:
            # TODO: error handling??
            print(f"invalid hittest result: {e}")

        self._default_navi.mouse_clicked(x, y, mod, hit_res)

        # msg = (
        #     f"Molecule [{res['obj_name']}],"
        #     + f" {res['message']}, "
        #     + f"O: {res['occ']} B: {res['bfac']} "
        #     + f"Pos: ({res['x']}, {res['y']}, {res['z']})"
        # )
        # print(msg)
        # self.append_log(msg)
