import { storage } from "#imports"
import { atom } from "jotai"
import { SIDEBAR_OPEN_STORAGE_KEY } from "@/utils/constants/storage-keys"
import { swallowInvalidatedStorageRead } from "@/utils/extension-lifecycle"
import { logger } from "@/utils/logger"

export { SIDEBAR_OPEN_STORAGE_KEY }

type SidebarOpenUpdate = boolean | ((current: boolean) => boolean)

const baseSideOpenAtom = atom(false)
let localWriteVersion = 0

function resolveSidebarOpenUpdate(update: SidebarOpenUpdate, current: boolean): boolean {
  return typeof update === "function" ? update(current) : update
}

export const isSideOpenAtom = atom(
  get => get(baseSideOpenAtom),
  async (get, set, update: SidebarOpenUpdate) => {
    const previous = get(baseSideOpenAtom)
    const next = resolveSidebarOpenUpdate(update, previous)
    localWriteVersion += 1

    set(baseSideOpenAtom, next)

    try {
      await storage.setItem(SIDEBAR_OPEN_STORAGE_KEY, next)
    }
    catch (error) {
      logger.error("Failed to persist sidebar open state", { next, error })
      set(baseSideOpenAtom, previous)
    }
  },
)

baseSideOpenAtom.onMount = (setAtom) => {
  const initialReadVersion = localWriteVersion
  let didReceiveStorageUpdate = false

  function loadPersistedOpenState(reason: string) {
    void storage.getItem<boolean>(SIDEBAR_OPEN_STORAGE_KEY)
      .then((value) => {
        setAtom(value === true)
      })
      .catch(swallowInvalidatedStorageRead(reason))
  }

  void storage.getItem<boolean>(SIDEBAR_OPEN_STORAGE_KEY)
    .then((value) => {
      if (!didReceiveStorageUpdate && localWriteVersion === initialReadVersion)
        setAtom(value === true)
    })
    .catch(swallowInvalidatedStorageRead("sidebar open state initial"))

  const unwatch = storage.watch<boolean>(SIDEBAR_OPEN_STORAGE_KEY, (value) => {
    didReceiveStorageUpdate = true
    setAtom(value === true)
  })

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible")
      loadPersistedOpenState("sidebar open state visibilitychange")
  }
  document.addEventListener("visibilitychange", handleVisibilityChange)

  return () => {
    unwatch()
    document.removeEventListener("visibilitychange", handleVisibilityChange)
  }
}
