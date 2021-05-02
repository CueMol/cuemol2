import logging
from logging import CRITICAL  # NOQA
from logging import DEBUG  # NOQA
from logging import ERROR  # NOQA
from logging import FATAL  # NOQA
from logging import INFO  # NOQA
from logging import WARN  # NOQA
from logging import WARNING  # NOQA
from typing import List, Optional

_default_handler: Optional[logging.Handler] = None
_root_names: Optional[List[str]] = None


def _get_library_root_loggers(names: List[str]) -> List[logging.Logger]:
    loggers = [logging.getLogger(n) for n in names]
    return loggers


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def setup(root_names: Optional[str] = None) -> None:
    global _root_names
    if root_names is None:
        _root_names = ["cuemol", "cuemol_gui"]
    else:
        _root_names = root_names

    global _default_handler
    if _default_handler is not None:
        raise RuntimeError("logger is already initialized")

    _default_handler = logging.StreamHandler()  # Set sys.stderr as stream.
    _default_handler.setFormatter(logging.Formatter(fmt="%(name)s: %(message)s"))

    loggers = _get_library_root_loggers(_root_names)
    # Apply our default configuration to the library root logger.
    for log in loggers:
        log.addHandler(_default_handler)
        log.setLevel(logging.INFO)
        log.propagate = False


def set_verbosity(verbosity: int) -> None:
    global _root_names
    if _root_names is None:
        raise RuntimeError("logger is not initialized")

    loggers = _get_library_root_loggers(_root_names)

    for log in loggers:
        log.setLevel(verbosity)
