from . import command, scene, fileio

command.register("bg_color", scene.bg_color, [command.AT_COLSTR, command.AT_SCENENAME], "change background color of scene")
command.register("undo", scene.undo, [command.AT_SCENENAME], "undo operation")
command.register("redo", scene.redo, [command.AT_SCENENAME], "redo operation")
command.register("curr", scene.current, [command.AT_RENDNAME], "change/show current renderer")

command.register("load", fileio.load, [command.AT_PATH, command.AT_STRING, command.AT_STRING, command.AT_INTEGER], "load scene or object")


