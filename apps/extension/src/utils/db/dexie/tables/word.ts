import { Entity } from "dexie"

export default class Word extends Entity {
  id!: number
  word!: string
  context!: string
  sourceUrl!: string
  translation?: string
  interval!: number
  repetitions!: number
  nextReviewAt!: Date
  createdAt!: Date
}
