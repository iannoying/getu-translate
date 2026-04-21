import type { Entitlements } from "@/types/entitlements"
import { atom } from "jotai"
import { FREE_ENTITLEMENTS } from "@/types/entitlements"

/**
 * Jotai atom holding the currently-active Entitlements for the signed-in user.
 * Starts as FREE_ENTITLEMENTS (fail-closed). Updated by `useEntitlements` when
 * the backend responds successfully.
 */
export const entitlementsAtom = atom<Entitlements>(FREE_ENTITLEMENTS)
