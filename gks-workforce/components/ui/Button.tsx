import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger' | 'ghost-primary';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
    'ghost-danger': 'btn-ghost-danger',
    'ghost-primary': 'btn-ghost-primary',
};

const sizeClass: Record<ButtonSize, string> = {
    sm: 'min-h-9 px-3 py-2 text-xs',
    md: '',
    lg: 'min-h-12 px-6 py-3 text-base w-full',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', fullWidth, className = '', children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={`${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} enabled:active:scale-[0.98] transition-transform duration-100 ${className}`}
                {...props}
            >
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';

export default Button;
