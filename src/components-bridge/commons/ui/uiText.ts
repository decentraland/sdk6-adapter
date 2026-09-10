import { Font, TextAlignMode } from '@dcl/sdk/ecs'
import { type UiLabelProps } from '@dcl/sdk/react-ecs'

export function textAlignFromHV(hAlign: string | undefined, vAlign: string | undefined): UiLabelProps['textAlign'] {
  const vertical = vAlign === 'top' || vAlign === 'bottom' ? vAlign : 'middle'
  const horizontal = hAlign === 'left' || hAlign === 'right' ? hAlign : 'center'
  return `${vertical}-${horizontal}`
}

export function stringToTextAlignMode(textAlign: UiLabelProps['textAlign']): TextAlignMode | undefined {
  switch (textAlign) {
    case 'top-left':
      return TextAlignMode.TAM_TOP_LEFT
    case 'top-right':
      return TextAlignMode.TAM_TOP_RIGHT
    case 'top-center':
      return TextAlignMode.TAM_TOP_CENTER
    case 'bottom-left':
      return TextAlignMode.TAM_BOTTOM_LEFT
    case 'bottom-right':
      return TextAlignMode.TAM_BOTTOM_RIGHT
    case 'bottom-center':
      return TextAlignMode.TAM_BOTTOM_CENTER
    case 'middle-left':
      return TextAlignMode.TAM_MIDDLE_LEFT
    case 'middle-right':
      return TextAlignMode.TAM_MIDDLE_RIGHT
    case 'middle-center':
      return TextAlignMode.TAM_MIDDLE_CENTER
  }
  return undefined
}

export function convertUiFontFromFont(font: Font | undefined): UiLabelProps['font'] {
  switch (font) {
    case Font.F_SERIF:
      return 'serif'
    case Font.F_MONOSPACE:
      return 'monospace'
    case Font.F_SANS_SERIF:
    default:
      return 'sans-serif'
  }
}
