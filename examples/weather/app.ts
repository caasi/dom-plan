import { Plan, mount, type Handler } from '../../src/index.ts'

type Forecast = { place: string; days: { date: string; max: number; min: number }[] }

async function fetchForecast(city: string): Promise<Forecast> {
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
  ).then(r => r.json())
  const hit = geo.results?.[0]
  if (!hit) throw new Error(`no place named ${city}`)
  const fc = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
      '&daily=temperature_2m_max,temperature_2m_min&timezone=auto',
  ).then(r => r.json())
  return {
    place: `${hit.name}, ${hit.country}`,
    days: fc.daily.time.map((date: string, i: number) => ({
      date,
      max: fc.daily.temperature_2m_max[i],
      min: fc.daily.temperature_2m_min[i],
    })),
  }
}

const day = (d: Forecast['days'][number]) =>
  Plan.create('li')
    .append(Plan.create('span').setText(d.date))
    .append(Plan.create('span').setText(`${d.min}° / ${d.max}°`))

// `forecast` is the guarded selection. `end()` goes back to it, so an empty guard (a stale
// response) keeps both parts empty. A part that starts from Plan.all would ignore the guard.
const render = (f: Forecast, forecast: Plan) =>
  f.days
    .reduce((p, d) => p.append(day(d)), forecast.find('.days').setText(''))
    .end()
    .find('.place')
    .setText(f.place)

let seq = 0

const submit: Handler = (e, form) => {
  e.preventDefault()
  const city = (form.querySelector('input') as HTMLInputElement).value.trim()
  const id = String(++seq)
  const current = Plan.all('#forecast').filter(el => (el as HTMLElement).dataset.req === id)
  return Plan.all('#forecast')
    .attr('data-req', id)
    .removeClass('error')
    .addClass('loading')
    .tap(() => {
      // Starts after data-req is set, so a settled promise cannot win the race (v3.1 review #1).
      fetchForecast(city)
        .then(f => render(f, current.removeClass('loading').addClass('has-data')).run(document))
        .catch(() =>
          current.removeClass('loading').removeClass('has-data').addClass('error').run(document),
        )
    })
}

mount(document.getElementById('app')!, [['submit', 'form', submit]])
