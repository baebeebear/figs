import { attributeColor, attributeIcon } from '../lib/attributeIcons'

type Props = {
  tags: string[]
  className?: string
}

/** Small colored pills (icon + label) for an ingredient's flavor-profile tags — distinct from the
 * icon-only `AttributeBadges` used for the fuller diet/allergen/texture attribute set. */
export default function FlavorProfilePills({ tags, className = '' }: Props) {
  if (!tags.length) return null
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map((tag) => {
        const Icon = attributeIcon(tag)
        const color = attributeColor(tag)
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] font-ui text-[10.5px] font-semibold capitalize"
            style={{ background: `${color}1A`, color }}
          >
            <Icon size={10} strokeWidth={2.4} aria-hidden />
            {tag}
          </span>
        )
      })}
    </div>
  )
}
