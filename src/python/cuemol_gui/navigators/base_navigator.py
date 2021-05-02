class BaseNavigator:
    def __init__(self):
        pass

    def mouse_lbtn_clicked(self, x: int, y: int, mod, hit_res):
        raise NotImplementedError()

    def mouse_rbtn_clicked(self, x: int, y: int, mod, hit_res):
        raise NotImplementedError()
