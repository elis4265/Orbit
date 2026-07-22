import { Node, textblockTypeInputRule } from '@tiptap/core'
import { CodeMirrorView } from 'prosemirror-codemirror-6'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView as CMEditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { Compartment } from '@codemirror/state'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { Node as PMNode } from 'prosemirror-model'
import type { EditorView as PMView } from 'prosemirror-view'

const appTheme = CMEditorView.theme({
  '&': { background: 'transparent' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    lineHeight: '1.6',
  },
  '.cm-gutters': { background: '#1e2030', borderRight: '1px solid #2d3148' },
  '.cm-activeLineGutter': { background: 'rgba(255,255,255,0.04)' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.04)' },
})

const HEADER_STYLE = [
  'display:flex',
  'align-items:center',
  'padding:3px 10px',
  'background:#151820',
  'border-bottom:1px solid #2d3148',
  'gap:4px',
].join(';')

const LABEL_STYLE = [
  'color:#6b7280',
  'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
  'font-size:11px',
  'user-select:none',
].join(';')

const INPUT_STYLE = [
  'background:transparent',
  'border:none',
  'outline:none',
  'color:#9ca3af',
  'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
  'font-size:11px',
  'width:110px',
  'cursor:text',
].join(';')

const WRAPPER_STYLE = [
  'border-radius:6px',
  'overflow:hidden',
  'border:1px solid #2d3148',
  'margin:2px 0',
].join(';')

class CodeBlockNodeView {
  dom: HTMLElement
  private langInput: HTMLInputElement
  private cmv: CodeMirrorView
  private langCompartment = new Compartment()
  private currentLang = ''
  private pmView: PMView
  private pmGetPos: () => number | undefined

  constructor(node: PMNode, view: PMView, getPos: () => number | undefined) {
    this.pmView = view
    this.pmGetPos = getPos

    this.cmv = new CodeMirrorView({
      node,
      view,
      getPos,
      cmOptions: {
        extensions: [basicSetup, keymap.of([indentWithTab]), oneDark, appTheme, this.langCompartment.of([])] as never,
      },
    })

    // Language input
    this.langInput = document.createElement('input')
    this.langInput.type = 'text'
    this.langInput.value = (node.attrs.language as string | null) ?? ''
    this.langInput.placeholder = 'plain text'
    this.langInput.setAttribute('style', INPUT_STYLE)

    this.langInput.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        this.commitLanguage()
        this.cmv.cm.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.cmv.cm.focus()
      }
    })

    this.langInput.addEventListener('blur', () => this.commitLanguage())

    // Header bar
    const header = document.createElement('div')
    header.setAttribute('style', HEADER_STYLE)
    const label = document.createElement('span')
    label.textContent = 'lang:'
    label.setAttribute('style', LABEL_STYLE)
    header.appendChild(label)
    header.appendChild(this.langInput)

    // Wrapper
    const wrapper = document.createElement('div')
    wrapper.setAttribute('style', WRAPPER_STYLE)
    wrapper.appendChild(header)
    wrapper.appendChild(this.cmv.dom)

    this.dom = wrapper
    this.loadLanguage((node.attrs.language as string | null) ?? null)
  }

  private commitLanguage() {
    const lang = this.langInput.value.trim() || null
    const pos = this.pmGetPos()
    if (pos !== undefined) {
      this.pmView.dispatch(
        this.pmView.state.tr.setNodeMarkup(pos, undefined, { language: lang })
      )
    }
  }

  private async loadLanguage(lang: string | null) {
    const target = lang ?? ''
    if (target === this.currentLang) return
    this.currentLang = target
    const desc = target ? LanguageDescription.matchLanguageName(languages, target, true) : null
    const ext = desc ? await desc.load() : []
    if (this.currentLang === target) {
      this.cmv.cm.dispatch({ effects: this.langCompartment.reconfigure(ext) })
    }
  }

  update(node: PMNode): boolean {
    const ok = this.cmv.update(node)
    if (!ok) return false
    const newLang = (node.attrs.language as string | null) ?? ''
    if (newLang !== (this.langInput.value || '')) {
      this.langInput.value = newLang
    }
    if (newLang !== this.currentLang) {
      this.loadLanguage(node.attrs.language as string | null)
    }
    return true
  }

  selectNode() { this.cmv.selectNode() }
  setSelection(anchor: number, head: number) { this.cmv.setSelection(anchor, head) }
  stopEvent() { return true }
  ignoreMutation() { return true }
  destroy() { this.cmv.destroy() }
}

export const CodeBlockCodemirror = Node.create({
  name: 'codeBlock',
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (el) => el.querySelector('code')?.className.match(/language-(\S+)/)?.[1] ?? null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'pre', preserveWhitespace: 'full' }]
  },

  renderHTML({ node }) {
    return ['pre', {}, ['code', node.attrs.language ? { class: `language-${node.attrs.language as string}` } : {}, 0]]
  },

  addCommands() {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCodeBlock: (attrs?: { language: string }) => ({ commands }: any) => commands.setNode(this.name, attrs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toggleCodeBlock: (attrs?: { language: string }) => ({ commands }: any) => commands.toggleNode(this.name, 'paragraph', attrs),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetCodeBlock: () => ({ commands }: any) => commands.clearNodes(),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
    }
  },

  addInputRules() {
    return [textblockTypeInputRule({ find: /^```(\w*)\s$/, type: this.type, getAttributes: (match) => ({ language: match[1] || null }) })]
  },

  addNodeView() {
    return ({ node, view, getPos }) => new CodeBlockNodeView(node, view, getPos) as never
  },
})
