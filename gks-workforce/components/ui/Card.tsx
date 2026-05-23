import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    padding?: boolean;
    borderAccent?: 'blue' | 'green' | 'gray' | 'red' | 'none';
}

const accentClass = {
    blue: 'border-l-4 border-l-blue-600',
    green: 'border-l-4 border-l-green-600',
    gray: 'border-l-4 border-l-gray-400',
    red: 'border-l-4 border-l-red-600',
    none: '',
};

export default function Card({
    padding = true,
    borderAccent = 'none',
    className = '',
    children,
    ...props
}: CardProps) {
    return (
        <div className={`card-base ${accentClass[borderAccent]} ${padding ? 'p-6' : ''} ${className}`} {...props}>
            {children}
        </div>
    );
}
