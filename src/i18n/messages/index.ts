import type { DashLocaleCode } from '../../home/dashboardLocales'
import { en, type MessageDict } from './en'
import { es } from './es'
import { de } from './de'
import { fr } from './fr'
import { tr } from './tr'
import { uk } from './uk'
import { pt } from './pt'
import { ru } from './ru'
import { ja } from './ja'
import { ko } from './ko'

/** English is complete by construction; the rest fall back to it per key. */
export const MESSAGES: Record<DashLocaleCode, MessageDict> & { en: typeof en } = {
  en,
  es,
  de,
  fr,
  tr,
  uk,
  pt,
  ru,
  ja,
  ko,
}

export type { MessageDict, MessageKey } from './en'
