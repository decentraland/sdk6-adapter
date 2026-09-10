let reported = false

export const Ecs6UiWorldSpaceRejection = {
  update(): void {
    if (reported) return
    reported = true
    console.log(
      'SDK6 adapter: UIWorldSpace (class 23) was not registered by the reference renderer; world-space UI is unavailable.'
    )
  }
}
