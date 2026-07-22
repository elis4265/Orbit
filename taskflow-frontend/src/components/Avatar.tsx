interface AvatarProps {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  email?: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-16 h-16 text-2xl',
}

export function getInitials(firstName?: string | null, lastName?: string | null, username?: string | null, email?: string): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase()
  if (firstName) return firstName[0].toUpperCase()
  if (username) return username[0].toUpperCase()
  if (email) return email[0].toUpperCase()
  return '?'
}

export default function Avatar({ firstName, lastName, username, email, avatarUrl, size = 'sm', className = '' }: AvatarProps) {
  const sizeClass = SIZE_CLASS[size]
  const initials = getInitials(firstName, lastName, username, email)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={initials}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-brand flex items-center justify-center font-semibold text-white flex-shrink-0 ${className}`}
      title={firstName && lastName ? `${firstName} ${lastName}` : username ?? email ?? ''}
    >
      {initials}
    </div>
  )
}
