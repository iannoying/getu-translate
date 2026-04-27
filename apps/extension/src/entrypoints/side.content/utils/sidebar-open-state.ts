import { storage } from "#imports"
import { atom } from "jotai"
import { swallowInvalidatedStorageRead } from "@/utils/extension-lifecycle"
import { logger } from "@/utils/logger"

export const SIDEBAR_OPEN_STORAGE_KEY = "local:getu:side-content:open" as const

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

  void storage.getItem<boolean>(SIDEBAR_OPEN_STORAGE_KEY)
    .then((value) => {
      if (localWriteVersion === initialReadVersion)
        setAtom(value === true)
    })
    .catch(swallowInvalidatedStorageRead("sidebar open state initial"))

  return storage.watch<boolean>(SIDEBAR_OPEN_STORAGE_KEY, (value) => {
    setAtom(value === true)
  })
}
