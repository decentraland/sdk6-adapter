type Timer = { callback: (...args: any[]) => void; args: any[]; due: number; interval?: number }
const timers = new Map<number, Timer>()
let clock = 0
let nextId = 0
function schedule(callback: (...args: any[]) => void, delay = 0, interval = false, args: any[] = []): number {
  if (typeof callback !== 'function') throw new TypeError('SDK6 timer callback must be a function')
  const duration = Math.max(0, Number.isFinite(delay) ? delay : 0)
  const id = ++nextId
  timers.set(id, { callback, args, due: clock + duration, interval: interval ? duration : undefined })
  return id
}
export function setTimeout(callback: (...args: any[]) => void, delay = 0, ...args: any[]): number {
  return schedule(callback, delay, false, args)
}
export function setInterval(callback: (...args: any[]) => void, delay = 0, ...args: any[]): number {
  return schedule(callback, delay, true, args)
}
export function clearTimeout(id: number): void {
  timers.delete(id)
}
export function clearInterval(id: number): void {
  timers.delete(id)
}
export function advanceTimers(dt: number): void {
  clock += Math.max(0, Number.isFinite(dt) ? dt : 0) * 1000
  for (const [id, timer] of [...timers]) {
    if (!timers.has(id) || timer.due > clock) continue
    if (timer.interval === undefined) timers.delete(id)
    else timer.due = clock + timer.interval
    try {
      timer.callback(...timer.args)
    } catch (error) {
      console.error('SDK6 timer callback failed', error)
    }
  }
}
