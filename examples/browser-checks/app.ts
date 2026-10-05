import { Plan } from '../../src/index.ts'

// Checks that need a real browser (spike R19, R22/R28, R31). Results go to window.log.
const log: string[] = ((window as any).log = [])
const root = document.getElementById('root')!

Plan.from(root)
  .on([
    ['focus', '.field', () => void log.push('focus:field')],
    ['focusin', 'input', e => void log.push(`focusin:input type=${e.type}`)],
    [
      'click',
      '#p',
      e => {
        const ct = e.currentTarget
        return Plan.all('#p').tap(() =>
          log.push(`tap currentTarget is root: ${e.currentTarget === root}, saved: ${ct === root}`),
        )
      },
    ],
  ])
  .run(document)

;(window as any).focusFromTap = () => {
  log.push('run start')
  Plan.all('#i1')
    .tap(el => (el as HTMLElement).focus())
    .run(root)
  log.push('run end')
}
