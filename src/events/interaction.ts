let pointerDispatchDepth = 0
export function isPointerDispatch(): boolean {
  return pointerDispatchDepth > 0
}
export function duringPointerDispatch<T>(pointer: boolean, callback: () => T): T {
  const previous = pointerDispatchDepth
  pointerDispatchDepth = pointer ? previous + 1 : 0
  try {
    return callback()
  } finally {
    pointerDispatchDepth = previous
  }
}
