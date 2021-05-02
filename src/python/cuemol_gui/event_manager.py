import json
import traceback

import cuemol
from cuemol import logging

logger = logging.get_logger(__name__)
ci = cuemol.import_internal()


class EventManager:
    def __init__(self):
        self._mgr = cuemol.getService("ScrEventManager")
        self._mgr.addListener(self._listener)
        self._slot = {}

        self.INDEV_SHIFT = self._mgr.INDEV_SHIFT
        self.INDEV_CTRL = self._mgr.INDEV_CTRL
        self.INDEV_ALT = self._mgr.INDEV_ALT
        self.INDEV_LBTN = self._mgr.INDEV_LBTN
        self.INDEV_MBTN = self._mgr.INDEV_MBTN
        self.INDEV_RBTN = self._mgr.INDEV_RBTN

    @property
    def impl(self):
        return self._mgr

    def _listener(self, aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
        # logger.debug("Event listener called!!")
        # logger.debug(f"  slot ID={aSlotID}")
        # logger.debug(f"  cat str={aCatStr}")
        # logger.debug(f"  target ID={aTgtTypeID}")
        # logger.debug(f"  event ID={aEvtTypeID}")
        # logger.debug(f"  src ID={aSrcID}")
        # logger.debug(f"  info : {aInfoStr}")
        sSlotID = str(aSlotID)
        if sSlotID not in self._slot:
            # TODO: log error msg??
            return
        obs = self._slot[sSlotID]
        if not callable(obs):
            # TODO: log error msg??
            return

        # parse info arg
        info = None
        if isinstance(aInfoStr, str):
            # json str
            try:
                info = json.loads(str(aInfoStr))
            except json.JSONDecodeError:
                # TODO: log error msg??
                pass
        elif type(aInfoStr) == ci.Wrapper:
            # C++ object
            info = cuemol.createWrapper(aInfoStr)
        else:
            # unknown: no conv
            info = aInfoStr

        try:
            obs(aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, info)
        except Exception:
            traceback.print_exc()
            logger.error("exception occured in the event listener was ignored.")

    def add_listener(self, aCatStr, aSrcType, aEvtType, aSrcID, aObs):
        slot_id = self._mgr.append(aCatStr, aSrcType, aEvtType, aSrcID)
        # dd("event listener registered: <"+aCatStr+">, id="+slot_id);
        self._slot[str(slot_id)] = aObs
        return slot_id

    def remove_listener(self, nID):
        if self._mgr:
            self._mgr.remove(nID)

        # dd("EventManager, unload slot: "+nID);
        # this.mSlot[nID.toString()] = null;
        del self._slot[str(nID)]
        # dd(" --> removed: "+this.mSlot[nID.toString()]);

    def update_listener(self, nID, aCatStr, aSrcType, aEvtType, aSrcID, aObs):
        if nID is not None:
            self.remove_listener(nID)
        return self.add_listener(aCatStr, aSrcType, aEvtType, aSrcID, aObs)

    @classmethod
    def get_instance(cls):
        if not hasattr(cls, "_instance"):
            cls._instance = cls()
        return cls._instance
