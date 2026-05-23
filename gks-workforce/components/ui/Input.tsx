import { InputHTMLAttributes, forwardRef } from 'react';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({ className = '', ...props }, ref) => {
        return <input ref={ref} className={`input-base ${className}`} {...props} />;
    }
);

Input.displayName = 'Input';

export default Input;
