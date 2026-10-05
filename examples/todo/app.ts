import { Plan, type Handler } from '../../src/index.ts'

// All state lives in the DOM: li.done, li[data-id], ul[data-filter].
let seq = 0

const item = (id: string, text: string) =>
  Plan.create('li')
    .attr('data-id', id)
    .addClass('is-new') // CSS plays the entry animation
    .append(Plan.create('input').attr('type', 'checkbox').addClass('toggle'))
    .append(Plan.create('span').addClass('title').setText(text))
    .append(Plan.create('input').addClass('edit'))
    .append(Plan.create('button').addClass('delete').setText('×'))

const count = Plan.all('.count').tap(el => {
  el.textContent = String(el.closest('.todoapp')!.querySelectorAll('.todos li:not(.done)').length)
})

const add: Handler = (e, form) => {
  e.preventDefault()
  const input = form.querySelector('input') as HTMLInputElement
  const text = input.value.trim()
  if (!text) return
  return Plan.all('.todos')
    .append(item(String(++seq), text))
    .also(Plan.from(input).tap(el => ((el as HTMLInputElement).value = '')))
    .also(count)
}

const toggle: Handler = (_e, box) =>
  Plan.from(box)
    .closest('li')
    .toggleClass('done', (box as HTMLInputElement).checked)
    .also(count)

const remove: Handler = (_e, btn) => Plan.from(btn).closest('li').remove().also(count)

const filter: Handler = (_e, btn) => {
  const f = (btn as HTMLElement).dataset.filter!
  return Plan.all('.todos')
    .attr('data-filter', f)
    .also(Plan.all('.filters button').attr('aria-pressed', 'false'))
    .also(Plan.from(btn).attr('aria-pressed', 'true'))
}

const startEdit: Handler = (_e, title) =>
  Plan.from(title)
    .closest('li')
    .addClass('editing')
    .find('.edit')
    .tap(el => {
      const input = el as HTMLInputElement
      input.value = title.textContent ?? ''
      input.focus() // the li is in the document, so focus works inside tap
    })

const commitEdit = (input: HTMLInputElement) =>
  Plan.from(input).closest('li').removeClass('editing').find('.title').setText(input.value.trim())

const endEdit: Handler = (e, input) => {
  const ke = e as KeyboardEvent
  if (e.type === 'keydown' && ke.key !== 'Enter') return
  return commitEdit(input as HTMLInputElement)
}

Plan.all('.todoapp')
  .on([
    ['submit', 'form.new', add],
    ['change', '.toggle', toggle],
    ['click', '.delete', remove],
    ['click', '.filters button', filter],
    ['dblclick', '.title', startEdit],
    ['keydown', '.edit', endEdit],
    ['blur', '.edit', endEdit],
  ])
  .run(document)
