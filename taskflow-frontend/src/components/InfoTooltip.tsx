import { Info } from 'lucide-react'

interface Props {
  text: string
  width?: string
}

export default function InfoTooltip({ text, width = 'w-64' }: Props) {
  return (
    <div className="group relative inline-flex items-center">
      <Info size={13} className="text-gray-600 hover:text-gray-400 cursor-help transition-colors" />
      <div
        className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block ${width} bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 z-50 shadow-xl leading-relaxed`}
      >
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-700" />
      </div>
    </div>
  )
}
