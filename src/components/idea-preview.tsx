export function IdeaPreview({
  kind = 'flow',
  className = '',
}: {
  kind?: 'flow' | 'notes' | 'blank'
  className?: string
}) {
  if (kind === 'blank')
    return (
      <svg viewBox="0 0 480 280" className={className} aria-hidden="true">
        <rect
          x="162"
          y="66"
          width="150"
          height="146"
          rx="9"
          fill="#f5f3ff"
          stroke="#d8d2fa"
          strokeWidth="2"
          strokeDasharray="7 6"
        />
        <path
          d="M220 139h34m-17-17v34"
          stroke="#b3a9e5"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  if (kind === 'notes')
    return (
      <svg
        viewBox="0 0 480 280"
        className={`preview-svg ${className}`}
        aria-hidden="true"
      >
        <path
          d="m82 67 129-7 5 129-132 8Z"
          fill="#fff4bd"
          stroke="#d8ba58"
          strokeWidth="1.5"
        />
        <path
          d="m263 82 122 7-5 123-125-9Z"
          fill="#e3dffc"
          stroke="#aaa0df"
          strokeWidth="1.5"
        />
        <text x="110" y="105" fontSize="17" fill="#806d30">
          What if we...
        </text>
        <path
          d="m110 126 71-3m-71 19 60-2m-60 20 79-2"
          stroke="#b9a35c"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="281" y="123" fontSize="17" fill="#7060aa">
          Big ideas ✧
        </text>
        <path
          d="m279 144 70 3m-70 16 57 2m-57 16 73 2"
          stroke="#a090ce"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  return (
    <svg
      viewBox="0 0 480 280"
      className={`preview-svg ${className}`}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path
            d="m0 0 6 3-6 3"
            fill="none"
            stroke="#8b81b8"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      <path
        d="m60 105 103-2 2 71-106 3Z"
        fill="#eae5fc"
        stroke="#9b8ad2"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text x="79" y="146" fontSize="18" fill="#6f5b9c">
        An idea
      </text>
      <path
        d="m201 103 94 2-1 68-95 1Z"
        fill="#e1f0ee"
        stroke="#87b5aa"
        strokeWidth="1.8"
      />
      <text x="217" y="145" fontSize="18" fill="#557e72">
        Explore
      </text>
      <path
        d="m334 104 91-1 2 69-91 2Z"
        fill="#ffefd9"
        stroke="#d6ab70"
        strokeWidth="1.8"
      />
      <text x="350" y="144" fontSize="18" fill="#a47c44">
        Create!
      </text>
      <path
        d="M167 139q17-5 29 0m103 0q17 4 30-1"
        fill="none"
        stroke="#8b81b8"
        strokeWidth="1.8"
        markerEnd="url(#arrow)"
      />
      <path
        d="m102 72 8-15m8 18 15-9m-38 7-9-10M379 202l2 13m10-17 9 10m-35-10-9 10"
        stroke="#b6acd2"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
