import cuemol


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
        #         print("  slot ID="+str(aSlotID))
        #         print("  cat str="+str(aCatStr))
        #         print("  target ID="+str(aTgtTypeID))
        #         print("  event ID="+str(aEvtTypeID))
        #         print("  src ID="+str(aSrcID))
        #         print("  info : "+str(aInfoStr))
        sSlotID = str(aSlotID)
        if sSlotID in self._slot:
            obs = self._slot[sSlotID]
            if callable(obs):
                obs(aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr)

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
