import DOMPurify from 'dompurify'
import { createLowlight, common } from 'lowlight'

const low = createLowlight(common)

type HastNode =
  | { type: 'text'; value: string }
  | { type: 'element'; properties?: { className?: string[] }; children: HastNode[] }
  | { type: 'root'; children: HastNode[] }

function hastToHtml(node: HastNode): string {
  if (node.type === 'text') {
    return node.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
  const inner = node.children.map(hastToHtml).join('')
  if (node.type === 'element') {
    const cls = node.properties?.className?.join(' ')
    return cls ? `<span class="${cls}">${inner}</span>` : inner
  }
  return inner
}

function applyHighlighting(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll<HTMLElement>('pre code').forEach(el => {
    const lang = Array.from(el.classList).find(c => c.startsWith('language-'))?.slice(9)
    const code = el.textContent ?? ''
    try {
      const result = lang ? low.highlight(lang, code) : low.highlightAuto(code)
      el.innerHTML = hastToHtml(result as HastNode)
    } catch {
      // unknown language — leave plain
    }
    el.classList.add('hljs')
  })
  return doc.body.innerHTML
}

interface Props {
  html: string
  className?: string
}

export default function RichContent({ html, className }: Props) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(applyHighlighting(html)) }}
    />
  )
}
