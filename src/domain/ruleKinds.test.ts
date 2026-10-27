import { describe, expect, it } from 'vitest'
import { RULE_KINDS, ruleName } from './ruleKinds'
import { CHECKS } from '../rules/checks'

describe('виды проверок для HR', () => {
  it('для каждого вида проверки в модуле правил есть описание, и наоборот', () => {
    expect(Object.keys(RULE_KINDS).sort()).toEqual(Object.keys(CHECKS).sort())
  })

  it('название правила следует за параметрами', () => {
    expect(ruleName('group_limit', { role: 'МПП', max: 3 })).toBe('МПП: не более 3 в отпуске одновременно')
    expect(ruleName('season_max_length', { from: '06-01', to: '08-31', max_days: 14 })).toBe('С 01.06 по 31.08 не более 14 дн.')
    expect(ruleName('role_conflict', { role: 'ИД', peers: null, manager: false, subordinates: ['ЗАВ', 'ЗТВ'] }))
      .toBe('ИД: не одновременно с ЗАВ и ЗТВ')
    expect(ruleName('role_conflict', { role: 'НО', peers: 'отделение', manager: true, subordinates: [] }))
      .toBe('НО: не одновременно с другими «НО» своего отделения, своим руководителем')
  })
})
