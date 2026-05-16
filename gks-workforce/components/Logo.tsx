import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
    className?: string;
    width?: number;
    height?: number;
    href?: string;
}

export default function Logo({ className = '', width = 200, height = 60, href = '/dashboard' }: LogoProps) {
    return (
        <Link 
            href={href} 
            className={`flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer ${className}`}
        >
            <Image
                src="/logo.jpg"
                alt="GKS Logo"
                width={width}
                height={height}
                className="object-contain"
                priority
            />
        </Link>
    );
}
