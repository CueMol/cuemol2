import json

import cuemol

ci = cuemol.import_internal()


class EventManager:
    def __init__(self):
        self._mgr = cuemol.getService("ScrEventManager")
        self._mgr.addListener(self._listener)
        self._slot = {}

    @property
    def impl(self):
        return self._mgr

    def _listener(self, aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
        # print("Event listener called!!")
        # print(f"  slot ID={aSlotID}")
        # print(f"  cat str={aCatStr}")
        # print(f"  target ID={aTgtTypeID}")
        # print(f"  event ID={aEvtTypeID}")
        # print(f"  src ID={aSrcID}")
        # print(f"  info : {aInfoStr}")
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

        obs(aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, info)

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


# _instance = None
# def getEventManager():
#     print("********** getEventManager called!!")
#     global _instance
#     if _instance is None:
#         _instance = EventManager()
#     return _instance
