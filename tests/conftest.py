import pytest
import cuemol
from pathlib import Path

_TEST_DATA_DIR = Path(__file__).parent / "test_data"

# Git LFS pointer files begin with this line; a checked-out but un-fetched
# LFS file is a small text stub that starts with it rather than the real data.
_LFS_POINTER_PREFIX = b"version https://git-lfs.github.com/spec/v1"


def _lfs_data_available(filename):
    """True only when the real (non-pointer) data file is present on disk."""
    try:
        with open(_TEST_DATA_DIR / filename, "rb") as f:
            head = f.read(len(_LFS_POINTER_PREFIX))
    except OSError:
        return False  # missing or unreadable
    return not head.startswith(_LFS_POINTER_PREFIX)


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "requires_lfs_data(*files): test reads the named Git LFS-tracked "
        "files under test_data; skipped when any is absent or is an un-fetched "
        "LFS pointer stub. Runs wherever the real files exist.",
    )


def pytest_collection_modifyitems(config, items):
    # Skip on the actual condition -- the real data file not being present --
    # rather than on any CI-specific signal, so the same rule holds anywhere
    # (GitHub Actions, a fresh clone without `git lfs pull`, etc.).
    for item in items:
        marker = item.get_closest_marker("requires_lfs_data")
        if marker is None:
            continue
        missing = [fn for fn in marker.args if not _lfs_data_available(fn)]
        if missing:
            item.add_marker(
                pytest.mark.skip(
                    reason="Git LFS test data not available: " + ", ".join(missing)
                )
            )


@pytest.fixture
def test_data_path():
    return _TEST_DATA_DIR


@pytest.fixture
def mol_1crn_path(test_data_path):
    return test_data_path / "1CRN.pdb"


@pytest.fixture
def create_scene():
    mgr = cuemol.svc("CmdMgr")

    args = {"scene_name": "new scene", "create_view": False}
    result = mgr.runCmdArgs("new_scene", args)
    scene = result["result_scene"]
    yield scene

    # clean-up
    scmgr = cuemol.svc("SceneManager")
    scmgr.destroyAllScenes()
