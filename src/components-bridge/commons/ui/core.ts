import { renderAirdrop } from '../../../modules/AirdropUi'
import { type ECS6ComponentUiShape } from '~system/EngineApi'
import { ECS6_CLASS_ID, type AdaptationLayerState } from '../../../types'
import { renderEcs6UiRootComponent } from './UiRoot'
import { invalidateTextLayout } from './layout'

export type ComponentNode = {
  __id: string
  classId: number
  value: ECS6ComponentUiShape
  children: ComponentNode[]
}
const componentMap = new Map<string, ComponentNode>()
const sourceValues = new WeakMap<ComponentNode, ECS6ComponentUiShape>()
let topologyDirty = true
let roots: ComponentNode[] = []

function layoutRoot(node: ComponentNode): { id: string; fitted: boolean } | undefined {
  const seen = new Set<string>()
  let fitted = false
  while (!seen.has(node.__id)) {
    seen.add(node.__id)
    fitted ||= node.classId === ECS6_CLASS_ID.UI_CONTAINER_STACK || node.classId === ECS6_CLASS_ID.UI_SLIDER_SHAPE
    const parent = componentMap.get(node.value.parentComponent ?? '')
    if (!parent || parent.classId === ECS6_CLASS_ID.UI_SCREEN_SPACE_SHAPE || parent.classId === ECS6_CLASS_ID.UI_FULLSCREEN_SHAPE)
      return { id: node.__id, fitted }
    node = parent
  }
}

function refreshTextLayouts(root: string): void {
  for (const node of componentMap.values())
    if (node.classId === ECS6_CLASS_ID.UI_TEXT_SHAPE && layoutRoot(node)?.id === root) invalidateTextLayout(node.value)
}

export function updateComponent(componentId: string, classId: number, value: ECS6ComponentUiShape): void {
  const previous = componentMap.get(componentId)
  if (previous?.classId === classId && sourceValues.get(previous) === value) return
  const detached = previous && previous.value.parentComponent !== value.parentComponent ? layoutRoot(previous) : undefined
  topologyDirty = true
  const node = { __id: componentId, classId, value: { ...value }, children: [] }
  sourceValues.set(node, value)
  componentMap.set(componentId, node)
  const root = layoutRoot(node)
  if (root && (classId === ECS6_CLASS_ID.UI_TEXT_SHAPE || root.fitted)) refreshTextLayouts(root.id)
  if (detached?.fitted) refreshTextLayouts(detached.id)
}

export function removeComponent(componentId: string): void {
  const node = componentMap.get(componentId), root = node && layoutRoot(node)
  if (componentMap.delete(componentId)) topologyDirty = true
  if (root?.fitted) refreshTextLayouts(root.id)
}

export function renderEcs6Ui(state: AdaptationLayerState) {
  return () => {
    if (topologyDirty) {
      topologyDirty = false
      roots = []
      for (const component of componentMap.values()) component.children = []
      for (const component of componentMap.values()) {
        const parentId = component.value.parentComponent
        if (!parentId) {
          roots.push(component)
          continue
        }
        const parent = componentMap.get(parentId)
        if (!parent) continue
        const seen = new Set([component.__id])
        let ancestor: ComponentNode | undefined = parent
        let cyclic = false
        while (ancestor) {
          if (seen.has(ancestor.__id)) {
            cyclic = true
            break
          }
          seen.add(ancestor.__id)
          ancestor = componentMap.get(ancestor.value.parentComponent ?? '')
        }
        if (!cyclic) parent.children.push(component)
      }
    }
    return [
      ...roots.filter((c) => c.value.visible !== false).map((c) => renderEcs6UiRootComponent(state, c)),
      ...renderAirdrop()
    ]
  }
}
