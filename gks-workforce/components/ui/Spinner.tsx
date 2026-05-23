interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    label?: string;
}

const sizeClass = {
    sm: 'h-5 w-5 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-[3px]',
};

export default function Spinner({ size = 'md', className = '', label = 'Loading' }: SpinnerProps) {
    return (
        <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
            <div
                className={`animate-spin rounded-full border-blue-600 border-t-transparent ${sizeClass[size]}`}
                aria-hidden
            />
            <span className="sr-only">{label}</span>
        </div>
    );
}
