import { LucideIcon } from 'lucide-react';

const sizeMap = {
    sm: 16,
    md: 20,
    lg: 24,
} as const;

export type IconSize = keyof typeof sizeMap;

interface IconProps {
    icon: LucideIcon;
    size?: IconSize;
    className?: string;
    'aria-hidden'?: boolean;
}

export default function Icon({ icon: LucideComponent, size = 'md', className = '', ...props }: IconProps) {
    const pixelSize = sizeMap[size];
    return (
        <LucideComponent
            size={pixelSize}
            className={`shrink-0 ${className}`}
            aria-hidden={props['aria-hidden'] ?? true}
        />
    );
}
